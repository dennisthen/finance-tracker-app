import express from 'express';
import { body, validationResult } from 'express-validator';
import Transaction from '../models/Transaction.js';
import Budget from '../models/Budget.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

// Get all transactions
router.get('/', async (req, res) => {
  try {
    const { type, category, startDate, endDate, limit = 50, skip = 0 } = req.query;

    const filter = { user: req.user.id };

    if (type) filter.type = type;
    if (category) filter.category = category;

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(filter)
      .populate('category')
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Transaction.countDocuments(filter);

    res.status(200).json({ success: true, transactions, total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get transaction by ID
router.get('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id).populate('category');

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    res.status(200).json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create transaction
router.post(
  '/',
  [
    body('description', 'Description is required').trim().notEmpty(),
    body('amount', 'Amount must be a positive number').isFloat({ min: 0 }),
    body('type', 'Type must be income or expense').isIn(['income', 'expense']),
    body('category', 'Category is required').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { description, amount, type, category, date, notes } = req.body;

      const transaction = new Transaction({
        description,
        amount: parseFloat(amount),
        type,
        category,
        user: req.user.id,
        date: date ? new Date(date) : new Date(),
        notes,
      });

      await transaction.save();
      await transaction.populate('category');

      // Update budget if expense
      if (type === 'expense') {
        const now = new Date(transaction.date);
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const budget = await Budget.findOneAndUpdate(
          {
            user: req.user.id,
            category: category,
            month,
            year,
          },
          {
            $inc: { spent: amount },
          },
          { new: true }
        );

        // Check if budget alert threshold exceeded
        if (budget && budget.limit > 0) {
          const percentageUsed = (budget.spent / budget.limit) * 100;
          if (percentageUsed >= budget.alertThreshold) {
            // Budget alert logic can be extended here
          }
        }
      }

      res.status(201).json({ success: true, transaction });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Update transaction
router.put('/:id', async (req, res) => {
  try {
    let transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const { description, amount, type, category, date, notes } = req.body;

    if (description) transaction.description = description;
    if (amount) transaction.amount = parseFloat(amount);
    if (type) transaction.type = type;
    if (category) transaction.category = category;
    if (date) transaction.date = new Date(date);
    if (notes) transaction.notes = notes;

    await transaction.save();
    await transaction.populate('category');

    res.status(200).json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete transaction
router.delete('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Reverse budget update if expense
    if (transaction.type === 'expense') {
      const now = new Date(transaction.date);
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      await Budget.findOneAndUpdate(
        {
          user: req.user.id,
          category: transaction.category,
          month,
          year,
        },
        {
          $inc: { spent: -transaction.amount },
        }
      );
    }

    await Transaction.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get summary (income vs expenses)
router.get('/summary/overview', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const filter = { user: req.user.id };

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const result = await Transaction.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
        },
      },
    ]);

    const summary = {
      income: 0,
      expenses: 0,
    };

    result.forEach((item) => {
      if (item._id === 'income') summary.income = item.total;
      if (item._id === 'expense') summary.expenses = item.total;
    });

    summary.balance = summary.income - summary.expenses;

    res.status(200).json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
