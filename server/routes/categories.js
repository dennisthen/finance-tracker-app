import express from 'express';
import { body, validationResult } from 'express-validator';
import Category from '../models/Category.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

// Get all categories for user
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ user: req.user.id }).sort({ type: 1, name: 1 });
    res.status(200).json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get categories by type
router.get('/type/:type', async (req, res) => {
  try {
    const categories = await Category.find({
      user: req.user.id,
      type: req.params.type,
    }).sort({ name: 1 });
    res.status(200).json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create category
router.post(
  '/',
  [
    body('name', 'Name is required').trim().notEmpty(),
    body('type', 'Type must be income or expense').isIn(['income', 'expense']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const { name, type, color, icon } = req.body;

      const category = new Category({
        name,
        type,
        color: color || '#3b82f6',
        icon: icon || '💰',
        user: req.user.id,
      });

      await category.save();
      res.status(201).json({ success: true, category });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ success: false, message: 'Category already exists for this type' });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Update category
router.put('/:id', async (req, res) => {
  try {
    let category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    if (category.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this category' });
    }

    const { name, color, icon } = req.body;
    if (name) category.name = name;
    if (color) category.color = color;
    if (icon) category.icon = icon;

    await category.save();
    res.status(200).json({ success: true, category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete category
router.delete('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    if (category.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this category' });
    }

    await Category.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
