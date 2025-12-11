const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      minlength: 2,
      maxlength: 100
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

categorySchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');
  }
  next();
});

module.exports = mongoose.model('Category', categorySchema);
