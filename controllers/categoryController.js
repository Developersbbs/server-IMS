const mongoose = require('mongoose');
const Category = require('../models/Category');

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
const getCategories = async (req, res) => {
  try {
    const { status = 'active' } = req.query;

    let query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const categories = await Category.find(query).sort({ name: 1 });
    res.status(200).json({ categories });
  } catch (error) {
    res.status(500).json({
      message: 'Server Error: Could not fetch categories.',
      error: error.message
    });
  }
};

// @desc    Create a new category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = async (req, res) => {
  try {
    const { name, description, status = 'active' } = req.body;

    // Check if category already exists
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingCategory) {
      return res.status(400).json({
        message: 'Category with this name already exists.'
      });
    }

    const category = new Category({
      name,
      description,
      status,
      createdBy: req.user._id
    });

    const savedCategory = await category.save();
    res.status(201).json(savedCategory);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        message: 'Validation Error',
        errors
      });
    }
    res.status(500).json({
      message: 'Server Error: Could not create category.',
      error: error.message
    });
  }
};

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = async (req, res) => {
  try {
    const { name, description, status } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if new name conflicts with existing category
    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.params.id }
      });

      if (existingCategory) {
        return res.status(400).json({
          message: 'Category with this name already exists.'
        });
      }
    }

    // Update fields
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (status) category.status = status;

    const updatedCategory = await category.save();
    res.status(200).json(updatedCategory);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        message: 'Validation Error',
        errors
      });
    }
    res.status(500).json({
      message: 'Server Error: Could not update category.',
      error: error.message
    });
  }
};

// @desc    Update category status
// @route   PATCH /api/categories/:id/status
// @access  Private/Admin
const toggleCategoryStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    category.status = status;
    const updatedCategory = await category.save();

    res.status(200).json(updatedCategory);
  } catch (error) {
    res.status(500).json({
      message: 'Server Error: Could not update category status.',
      error: error.message
    });
  }
};

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if category is being used by products
    const Product = require('../models/Product');
    const productsUsingCategory = await Product.countDocuments({ category: req.params.id });

    if (productsUsingCategory > 0) {
      return res.status(400).json({
        message: `Cannot delete category. It is being used by ${productsUsingCategory} product(s).`
      });
    }

    await category.deleteOne();
    res.status(200).json({
      message: 'Category deleted successfully',
      categoryId: req.params.id
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server Error: Could not delete category.',
      error: error.message
    });
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
};
