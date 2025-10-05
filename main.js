// ====================================
// E-COMMERCE CATALOG - NESTED DOCUMENT STRUCTURE
// ====================================
// Complete MongoDB implementation with nested variants
// Single file for easy deployment and understanding

const express = require('express');
const mongoose = require('mongoose');

// ====================================
// CONFIGURATION
// ====================================
const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerceCatalogDB';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====================================
// NESTED SCHEMAS - Product Model
// ====================================

// Review Schema (Nested)
const reviewSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 500
  },
  date: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

// Variant Schema (Nested)
const variantSchema = new mongoose.Schema({
  color: {
    type: String,
    required: [true, 'Variant color is required'],
    trim: true
  },
  size: {
    type: String,
    required: [true, 'Variant size is required'],
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size', 'Custom'],
    trim: true
  },
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  additionalPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  images: [{
    type: String,
    trim: true
  }],
  weight: {
    value: Number,
    unit: {
      type: String,
      enum: ['g', 'kg', 'lb', 'oz'],
      default: 'kg'
    }
  }
}, { _id: true });

// Specifications Schema (Nested)
const specificationSchema = new mongoose.Schema({
  material: String,
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    unit: {
      type: String,
      enum: ['cm', 'm', 'in', 'ft'],
      default: 'cm'
    }
  },
  warranty: String,
  manufacturer: String,
  countryOfOrigin: String
}, { _id: false });

// Main Product Schema with Nested Documents
const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    minlength: [3, 'Product name must be at least 3 characters'],
    maxlength: [200, 'Product name cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    trim: true,
    maxlength: 2000
  },
  basePrice: {
    type: Number,
    required: [true, 'Base price is required'],
    min: [0, 'Price cannot be negative']
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'INR', 'JPY']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Electronics',
      'Clothing',
      'Shoes',
      'Accessories',
      'Home & Kitchen',
      'Sports & Outdoors',
      'Books',
      'Toys & Games',
      'Beauty & Personal Care',
      'Automotive',
      'Other'
    ],
    trim: true
  },
  subcategory: {
    type: String,
    trim: true
  },
  brand: {
    type: String,
    required: [true, 'Brand is required'],
    trim: true
  },
  
  // NESTED ARRAY: Product Variants
  variants: {
    type: [variantSchema],
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'Product must have at least one variant'
    }
  },
  
  // NESTED OBJECT: Product Specifications
  specifications: specificationSchema,
  
  // NESTED ARRAY: Product Reviews
  reviews: [reviewSchema],
  
  tags: [{
    type: String,
    trim: true
  }],
  
  mainImage: {
    type: String,
    required: true,
    trim: true
  },
  
  additionalImages: [{
    type: String,
    trim: true
  }],
  
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Discontinued', 'Out of Stock'],
    default: 'Active'
  },
  
  featured: {
    type: Boolean,
    default: false
  },
  
  discount: {
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    validUntil: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual: Calculate average rating from reviews
productSchema.virtual('averageRating').get(function() {
  if (!this.reviews || this.reviews.length === 0) return 0;
  const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
  return (sum / this.reviews.length).toFixed(1);
});

// Virtual: Calculate total stock across all variants
productSchema.virtual('totalStock').get(function() {
  if (!this.variants || this.variants.length === 0) return 0;
  return this.variants.reduce((acc, variant) => acc + variant.stock, 0);
});

// Virtual: Calculate discounted price
productSchema.virtual('discountedPrice').get(function() {
  if (this.discount && this.discount.percentage > 0) {
    const discountAmount = (this.basePrice * this.discount.percentage) / 100;
    return (this.basePrice - discountAmount).toFixed(2);
  }
  return this.basePrice;
});

// Index for better performance
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1, brand: 1 });
productSchema.index({ 'variants.sku': 1 });
productSchema.index({ status: 1 });

// Instance method: Check if product is available
productSchema.methods.isAvailable = function() {
  return this.status === 'Active' && this.totalStock > 0;
};

// Instance method: Get variant by SKU
productSchema.methods.getVariantBySku = function(sku) {
  return this.variants.find(v => v.sku === sku.toUpperCase());
};

// Static method: Find products by category
productSchema.statics.findByCategory = function(category) {
  return this.find({ category: category, status: 'Active' });
};

// Static method: Find products with variants in stock
productSchema.statics.findInStock = function() {
  return this.find({
    status: 'Active',
    'variants.stock': { $gt: 0 }
  });
};

// Pre-save middleware: Update status if all variants are out of stock
productSchema.pre('save', function(next) {
  const totalStock = this.variants.reduce((acc, v) => acc + v.stock, 0);
  if (totalStock === 0 && this.status === 'Active') {
    this.status = 'Out of Stock';
  }
  next();
});

const Product = mongoose.model('Product', productSchema);

// ====================================
// SAMPLE DATA GENERATOR
// ====================================
async function generateSampleData() {
  try {
    // Check if data already exists
    const count = await Product.countDocuments();
    if (count > 0) {
      console.log('📦 Sample data already exists');
      return;
    }

    const sampleProducts = [
      {
        name: 'Premium Cotton T-Shirt',
        description: 'Comfortable 100% cotton t-shirt perfect for everyday wear. Pre-shrunk fabric ensures lasting fit.',
        basePrice: 29.99,
        currency: 'USD',
        category: 'Clothing',
        subcategory: 'T-Shirts',
        brand: 'ComfortWear',
        mainImage: 'https://example.com/images/tshirt-main.jpg',
        additionalImages: [
          'https://example.com/images/tshirt-back.jpg',
          'https://example.com/images/tshirt-detail.jpg'
        ],
        variants: [
          {
            color: 'Black',
            size: 'M',
            stock: 50,
            sku: 'TSH-BLK-M-001',
            additionalPrice: 0,
            images: ['https://example.com/images/tshirt-black-m.jpg'],
            weight: { value: 0.2, unit: 'kg' }
          },
          {
            color: 'Black',
            size: 'L',
            stock: 45,
            sku: 'TSH-BLK-L-001',
            additionalPrice: 0,
            images: ['https://example.com/images/tshirt-black-l.jpg'],
            weight: { value: 0.22, unit: 'kg' }
          },
          {
            color: 'White',
            size: 'M',
            stock: 60,
            sku: 'TSH-WHT-M-001',
            additionalPrice: 0,
            images: ['https://example.com/images/tshirt-white-m.jpg'],
            weight: { value: 0.2, unit: 'kg' }
          },
          {
            color: 'Navy Blue',
            size: 'L',
            stock: 30,
            sku: 'TSH-NVY-L-001',
            additionalPrice: 2,
            images: ['https://example.com/images/tshirt-navy-l.jpg'],
            weight: { value: 0.22, unit: 'kg' }
          }
        ],
        specifications: {
          material: '100% Cotton',
          dimensions: {
            length: 70,
            width: 50,
            height: 1,
            unit: 'cm'
          },
          warranty: '30 days return policy',
          manufacturer: 'ComfortWear Inc.',
          countryOfOrigin: 'India'
        },
        reviews: [
          {
            username: 'john_doe',
            rating: 5,
            comment: 'Excellent quality! Very comfortable and fits perfectly.',
            date: new Date('2025-09-15')
          },
          {
            username: 'sarah_smith',
            rating: 4,
            comment: 'Good quality shirt, but runs slightly small.',
            date: new Date('2025-09-20')
          }
        ],
        tags: ['cotton', 'casual', 'comfortable', 'basic'],
        status: 'Active',
        featured: true,
        discount: {
          percentage: 10,
          validUntil: new Date('2025-12-31')
        }
      },
      {
        name: 'Wireless Bluetooth Headphones',
        description: 'Premium over-ear headphones with active noise cancellation, 30-hour battery life, and superior sound quality.',
        basePrice: 199.99,
        currency: 'USD',
        category: 'Electronics',
        subcategory: 'Audio',
        brand: 'SoundMaster',
        mainImage: 'https://example.com/images/headphones-main.jpg',
        additionalImages: [
          'https://example.com/images/headphones-side.jpg',
          'https://example.com/images/headphones-case.jpg'
        ],
        variants: [
          {
            color: 'Black',
            size: 'One Size',
            stock: 25,
            sku: 'HPH-BLK-OS-001',
            additionalPrice: 0,
            images: ['https://example.com/images/headphones-black.jpg'],
            weight: { value: 250, unit: 'g' }
          },
          {
            color: 'Silver',
            size: 'One Size',
            stock: 15,
            sku: 'HPH-SLV-OS-001',
            additionalPrice: 20,
            images: ['https://example.com/images/headphones-silver.jpg'],
            weight: { value: 250, unit: 'g' }
          },
          {
            color: 'Rose Gold',
            size: 'One Size',
            stock: 10,
            sku: 'HPH-RSG-OS-001',
            additionalPrice: 30,
            images: ['https://example.com/images/headphones-rosegold.jpg'],
            weight: { value: 250, unit: 'g' }
          }
        ],
        specifications: {
          material: 'Aluminum and Leather',
          dimensions: {
            length: 20,
            width: 18,
            height: 8,
            unit: 'cm'
          },
          warranty: '2 years manufacturer warranty',
          manufacturer: 'SoundMaster Technologies',
          countryOfOrigin: 'Japan'
        },
        reviews: [
          {
            username: 'audio_enthusiast',
            rating: 5,
            comment: 'Best headphones I have ever owned! Crystal clear sound and excellent noise cancellation.',
            date: new Date('2025-08-10')
          },
          {
            username: 'music_lover',
            rating: 5,
            comment: 'Worth every penny. Battery life is amazing!',
            date: new Date('2025-09-05')
          },
          {
            username: 'tech_reviewer',
            rating: 4,
            comment: 'Great sound quality, but a bit heavy for long sessions.',
            date: new Date('2025-09-25')
          }
        ],
        tags: ['wireless', 'bluetooth', 'noise-cancellation', 'premium', 'audio'],
        status: 'Active',
        featured: true,
        discount: {
          percentage: 15,
          validUntil: new Date('2025-11-30')
        }
      },
      {
        name: 'Running Shoes - Pro Series',
        description: 'Professional running shoes with advanced cushioning technology, breathable mesh, and excellent grip for all terrains.',
        basePrice: 89.99,
        currency: 'USD',
        category: 'Shoes',
        subcategory: 'Athletic',
        brand: 'RunFast',
        mainImage: 'https://example.com/images/shoes-main.jpg',
        additionalImages: [
          'https://example.com/images/shoes-side.jpg',
          'https://example.com/images/shoes-sole.jpg'
        ],
        variants: [
          {
            color: 'Red',
            size: 'M',
            stock: 20,
            sku: 'SHO-RED-M-001',
            additionalPrice: 0,
            images: ['https://example.com/images/shoes-red-m.jpg'],
            weight: { value: 350, unit: 'g' }
          },
          {
            color: 'Red',
            size: 'L',
            stock: 18,
            sku: 'SHO-RED-L-001',
            additionalPrice: 0,
            images: ['https://example.com/images/shoes-red-l.jpg'],
            weight: { value: 380, unit: 'g' }
          },
          {
            color: 'Blue',
            size: 'M',
            stock: 25,
            sku: 'SHO-BLU-M-001',
            additionalPrice: 0,
            images: ['https://example.com/images/shoes-blue-m.jpg'],
            weight: { value: 350, unit: 'g' }
          },
          {
            color: 'Black',
            size: 'L',
            stock: 30,
            sku: 'SHO-BLK-L-001',
            additionalPrice: 5,
            images: ['https://example.com/images/shoes-black-l.jpg'],
            weight: { value: 380, unit: 'g' }
          }
        ],
        specifications: {
          material: 'Breathable Mesh and Synthetic',
          dimensions: {
            length: 30,
            width: 12,
            height: 10,
            unit: 'cm'
          },
          warranty: '6 months manufacturer warranty',
          manufacturer: 'RunFast Sports',
          countryOfOrigin: 'Vietnam'
        },
        reviews: [
          {
            username: 'marathon_runner',
            rating: 5,
            comment: 'Perfect for long distance running. Very comfortable!',
            date: new Date('2025-07-20')
          }
        ],
        tags: ['running', 'sports', 'athletic', 'breathable', 'cushioned'],
        status: 'Active',
        featured: false,
        discount: {
          percentage: 0,
          validUntil: null
        }
      },
      {
        name: 'Stainless Steel Water Bottle',
        description: 'Eco-friendly insulated water bottle that keeps drinks cold for 24 hours and hot for 12 hours. BPA-free and leak-proof.',
        basePrice: 24.99,
        currency: 'USD',
        category: 'Home & Kitchen',
        subcategory: 'Drinkware',
        brand: 'EcoHydrate',
        mainImage: 'https://example.com/images/bottle-main.jpg',
        additionalImages: [
          'https://example.com/images/bottle-cap.jpg'
        ],
        variants: [
          {
            color: 'Silver',
            size: 'One Size',
            stock: 100,
            sku: 'BTL-SLV-OS-001',
            additionalPrice: 0,
            images: ['https://example.com/images/bottle-silver.jpg'],
            weight: { value: 300, unit: 'g' }
          },
          {
            color: 'Matte Black',
            size: 'One Size',
            stock: 85,
            sku: 'BTL-BLK-OS-001',
            additionalPrice: 3,
            images: ['https://example.com/images/bottle-black.jpg'],
            weight: { value: 300, unit: 'g' }
          },
          {
            color: 'Ocean Blue',
            size: 'One Size',
            stock: 75,
            sku: 'BTL-BLU-OS-001',
            additionalPrice: 3,
            images: ['https://example.com/images/bottle-blue.jpg'],
            weight: { value: 300, unit: 'g' }
          }
        ],
        specifications: {
          material: 'Stainless Steel 304',
          dimensions: {
            length: 27,
            width: 7,
            height: 7,
            unit: 'cm'
          },
          warranty: '1 year warranty',
          manufacturer: 'EcoHydrate Inc.',
          countryOfOrigin: 'China'
        },
        reviews: [
          {
            username: 'eco_warrior',
            rating: 5,
            comment: 'Love this bottle! Keeps my water cold all day.',
            date: new Date('2025-08-15')
          },
          {
            username: 'fitness_fan',
            rating: 4,
            comment: 'Good quality, but the cap is a bit tight.',
            date: new Date('2025-09-10')
          }
        ],
        tags: ['eco-friendly', 'insulated', 'reusable', 'bpa-free', 'sustainable'],
        status: 'Active',
        featured: true,
        discount: {
          percentage: 20,
          validUntil: new Date('2025-10-31')
        }
      }
    ];

    await Product.insertMany(sampleProducts);
    console.log('✅ Sample data inserted successfully');
    console.log(`📦 ${sampleProducts.length} products added to catalog`);
  } catch (error) {
    console.error('❌ Error generating sample data:', error);
  }
}

// ====================================
// CONTROLLERS - Business Logic
// ====================================

// Create new product
const createProduct = async (req, res) => {
  try {
    const product = new Product(req.body);
    const savedProduct = await product.save();
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: savedProduct
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message
    });
  }
};

// Get all products with filters
const getAllProducts = async (req, res) => {
  try {
    const {
      category,
      brand,
      status,
      featured,
      minPrice,
      maxPrice,
      search,
      color,
      size,
      inStock
    } = req.query;
    
    let query = {};
    
    // Filter by category
    if (category) query.category = category;
    
    // Filter by brand
    if (brand) query.brand = brand;
    
    // Filter by status
    if (status) query.status = status;
    
    // Filter by featured
    if (featured !== undefined) query.featured = featured === 'true';
    
    // Price range filter
    if (minPrice || maxPrice) {
      query.basePrice = {};
      if (minPrice) query.basePrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.basePrice.$lte = parseFloat(maxPrice);
    }
    
    // Search in name and description
    if (search) {
      query.$text = { $search: search };
    }
    
    // Filter by variant color
    if (color) {
      query['variants.color'] = color;
    }
    
    // Filter by variant size
    if (size) {
      query['variants.size'] = size;
    }
    
    // Filter by stock availability
    if (inStock === 'true') {
      query['variants.stock'] = { $gt: 0 };
    }
    
    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .select('-__v');
    
    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
};

// Get product by ID
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select('-__v');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error fetching product',
      error: error.message
    });
  }
};

// Get products by category
const getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const products = await Product.findByCategory(category);
    
    res.status(200).json({
      success: true,
      count: products.length,
      category,
      data: products
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching products by category',
      error: error.message
    });
  }
};

// Get specific variant details
const getVariantBySku = async (req, res) => {
  try {
    const { id, sku } = req.params;
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    const variant = product.getVariantBySku(sku);
    
    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Variant not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        productName: product.name,
        basePrice: product.basePrice,
        variant: variant,
        finalPrice: product.basePrice + variant.additionalPrice
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching variant',
      error: error.message
    });
  }
};

// Add variant to existing product
const addVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const variantData = req.body;
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    product.variants.push(variantData);
    await product.save();
    
    res.status(200).json({
      success: true,
      message: 'Variant added successfully',
      data: product
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error adding variant',
      error: error.message
    });
  }
};

// Update variant stock
const updateVariantStock = async (req, res) => {
  try {
    const { id, sku } = req.params;
    const { stock } = req.body;
    
    const product = await Product.findOneAndUpdate(
      { _id: id, 'variants.sku': sku.toUpperCase() },
      { $set: { 'variants.$.stock': stock } },
      { new: true, runValidators: true }
    );
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product or variant not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Stock updated successfully',
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating stock',
      error: error.message
    });
  }
};

// Add review to product
const addReview = async (req, res) => {
  try {
    const { id } = req.params;
    const reviewData = req.body;
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    product.reviews.push(reviewData);
    await product.save();
    
    res.status(200).json({
      success: true,
      message: 'Review added successfully',
      averageRating: product.averageRating,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding review',
      error: error.message
    });
  }
};

// Get product statistics
const getStatistics = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const activeProducts = await Product.countDocuments({ status: 'Active' });
    
    const categoryStats = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const brandStats = await Product.aggregate([
      { $group: { _id: '$brand', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const averagePrice = await Product.aggregate([
      { $group: { _id: null, avgPrice: { $avg: '$basePrice' } } }
    ]);
    
    // Total stock across all variants
    const stockStats = await Product.aggregate([
      { $unwind: '$variants' },
      { $group: { _id: null, totalStock: { $sum: '$variants.stock' } } }
    ]);
    
    res.status(200).json({
      success: true,
      statistics: {
        totalProducts,
        activeProducts,
        inactiveProducts: totalProducts - activeProducts,
        averagePrice: averagePrice[0]?.avgPrice.toFixed(2) || 0,
        totalStock: stockStats[0]?.totalStock || 0,
        categoryDistribution: categoryStats,
        brandDistribution: brandStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};

// ====================================
// ROUTES - API Endpoints
// ====================================

app.get('/', (req, res) => {
  res.json({
    message: 'E-commerce Catalog API - Nested Document Structure',
    version: '1.0.0',
    endpoints: {
      'POST /api/products': 'Create a new product',
      'GET /api/products': 'Get all products (with filters)',
      'GET /api/products/:id': 'Get product by ID',
      'GET /api/products/category/:category': 'Get products by category',
      'GET /api/products/:id/variant/:sku': 'Get specific variant by SKU',
      'POST /api/products/:id/variants': 'Add variant to product',
      'PUT /api/products/:id/variants/:sku/stock': 'Update variant stock',
      'POST /api/products/:id/reviews': 'Add review to product',
      'GET /api/products/stats': 'Get catalog statistics'
    },
    availableCategories: [
      'Electronics', 'Clothing', 'Shoes', 'Accessories',
      'Home & Kitchen', 'Sports & Outdoors', 'Books',
      'Toys & Games', 'Beauty & Personal Care', 'Automotive', 'Other'
    ],
    queryFilters: {
      category: 'Filter by category',
      brand: 'Filter by brand',
      status: 'Filter by status (Active/Inactive/Discontinued/Out of Stock)',
      featured: 'Filter by featured (true/false)',
      minPrice: 'Minimum price filter',
      maxPrice: 'Maximum price filter',
      search: 'Search in product name and description',
      color: 'Filter by variant color',
      size: 'Filter by variant size',
      inStock: 'Filter products with stock (true/false)'
    }
  });
});

// Product routes
app.post('/api/products', createProduct);
app.get('/api/products', getAllProducts);
app.get('/api/products/stats', getStatistics);
app.get('/api/products/category/:category', getProductsByCategory);
app.get('/api/products/:id', getProductById);
app.get('/api/products/:id/variant/:sku', getVariantBySku);
app.post('/api/products/:id/variants', addVariant);
app.put('/api/products/:id/variants/:sku/stock', updateVariantStock);
app.post('/api/products/:id/reviews', addReview);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message
  });
});

// ====================================
// DATABASE CONNECTION & SERVER START
// ====================================
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('✅ Connected to MongoDB successfully');
  console.log(`📚 Database: ${MONGODB_URI}`);
  
  // Generate sample data
  await generateSampleData();
  
  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📖 API Documentation: http://localhost:${PORT}/`);
    console.log('\n🔍 Example Queries:');
    console.log(`   GET http://localhost:${PORT}/api/products`);
    console.log(`   GET http://localhost:${PORT}/api/products?category=Electronics`);
    console.log(`   GET http://localhost:${PORT}/api/products?inStock=true`);
    console.log(`   GET http://localhost:${PORT}/api/products/stats`);
  });
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});

// ====================================
// MONGODB SHELL QUERY EXAMPLES
// ====================================
/*
// Connect to MongoDB shell and use these queries:

// 1. RETRIEVE ALL PRODUCTS
db.products.find().pretty()

// 2. FILTER PRODUCTS BY CATEGORY
db.products.find({ category: "Electronics" }).pretty()

// 3. FILTER PRODUCTS BY BRAND
db.products.find({ brand: "ComfortWear" }).pretty()

// 4. PROJECT SPECIFIC VARIANT DETAILS (only name and variants)
db.products.find(
  {},
  { name: 1, variants: 1, _id: 0 }
).pretty()

// 5. FIND PRODUCTS WITH SPECIFIC VARIANT COLOR
db.products.find({ "variants.color": "Black" }).pretty()

// 6. FIND PRODUCTS WITH SPECIFIC VARIANT SIZE
db.products.find({ "variants.size": "L" }).pretty()

// 7. FIND PRODUCTS WITH VARIANTS IN STOCK
db.products.find({ "variants.stock": { $gt: 0 } }).pretty()

// 8. PROJECT ONLY VARIANT SKU AND STOCK
db.products.find(
  {},
  { name: 1, "variants.sku": 1, "variants.stock": 1, _id: 0 }
).pretty()

// 9. FIND SPECIFIC VARIANT BY SKU
db.products.find(
  { "variants.sku": "TSH-BLK-M-001" },
  { name: 1, basePrice: 1, "variants.$": 1 }
).pretty()

// 10. GET PRODUCTS WITH PRICE RANGE
db.products.find({
  basePrice: { $gte: 20, $lte: 100 }
}).pretty()

// 11. COUNT VARIANTS PER PRODUCT (Aggregation)
db.products.aggregate([
  {
    $project: {
      name: 1,
      variantCount: { $size: "$variants" }
    }
  }
])

// 12. CALCULATE TOTAL STOCK PER PRODUCT (Aggregation)
db.products.aggregate([
  {
    $project: {
      name: 1,
      totalStock: { $sum: "$variants.stock" }
    }
  }
])

// 13. GET PRODUCTS WITH REVIEWS
db.products.find({
  "reviews.0": { $exists: true }
}).pretty()

// 14. CALCULATE AVERAGE RATING (Aggregation)
db.products.aggregate([
  { $unwind: "$reviews" },
  {
    $group: {
      _id: "$name",
      avgRating: { $avg: "$reviews.rating" },
      reviewCount: { $sum: 1 }
    }
  }
])

// 15. FIND FEATURED PRODUCTS
db.products.find({ featured: true }).pretty()

// 16. GET PRODUCTS WITH ACTIVE DISCOUNT
db.products.find({
  "discount.percentage": { $gt: 0 },
  "discount.validUntil": { $gte: new Date() }
}).pretty()

// 17. GROUP PRODUCTS BY CATEGORY WITH COUNT
db.products.aggregate([
  {
    $group: {
      _id: "$category",
      count: { $sum: 1 },
      avgPrice: { $avg: "$basePrice" }
    }
  },
  { $sort: { count: -1 } }
])

// 18. FIND PRODUCTS WITH SPECIFIC SPECIFICATIONS
db.products.find({
  "specifications.material": { $regex: /Cotton/i }
}).pretty()

// 19. UPDATE VARIANT STOCK BY SKU
db.products.updateOne(
  { "variants.sku": "TSH-BLK-M-001" },
  { $set: { "variants.$.stock": 75 } }
)

// 20. ADD NEW VARIANT TO PRODUCT
db.products.updateOne(
  { _id: ObjectId("YOUR_PRODUCT_ID") },
  {
    $push: {
      variants: {
        color: "Green",
        size: "XL",
        stock: 40,
        sku: "TSH-GRN-XL-001",
        additionalPrice: 5,
        images: ["https://example.com/images/tshirt-green-xl.jpg"],
        weight: { value: 0.25, unit: "kg" }
      }
    }
  }
)

// 21. ADD REVIEW TO PRODUCT
db.products.updateOne(
  { _id: ObjectId("YOUR_PRODUCT_ID") },
  {
    $push: {
      reviews: {
        username: "new_user",
        rating: 5,
        comment: "Excellent product!",
        date: new Date()
      }
    }
  }
)

// 22. REMOVE SPECIFIC VARIANT BY SKU
db.products.updateOne(
  { _id: ObjectId("YOUR_PRODUCT_ID") },
  { $pull: { variants: { sku: "TSH-BLK-M-001" } } }
)

// 23. GET PRODUCTS SORTED BY PRICE (ASCENDING)
db.products.find().sort({ basePrice: 1 }).pretty()

// 24. GET PRODUCTS SORTED BY CREATION DATE (DESCENDING)
db.products.find().sort({ createdAt: -1 }).pretty()

// 25. TEXT SEARCH IN NAME AND DESCRIPTION
db.products.find({
  $text: { $search: "cotton comfortable" }
}).pretty()

// 26. GET DISTINCT CATEGORIES
db.products.distinct("category")

// 27. GET DISTINCT BRANDS
db.products.distinct("brand")

// 28. COUNT PRODUCTS BY STATUS
db.products.aggregate([
  {
    $group: {
      _id: "$status",
      count: { $sum: 1 }
    }
  }
])

// 29. FIND PRODUCTS WITH LOW STOCK (< 20 in any variant)
db.products.find({
  "variants.stock": { $lt: 20 }
}).pretty()

// 30. CALCULATE TOTAL INVENTORY VALUE
db.products.aggregate([
  { $unwind: "$variants" },
  {
    $group: {
      _id: null,
      totalValue: {
        $sum: {
          $multiply: [
            { $add: ["$basePrice", "$variants.additionalPrice"] },
            "$variants.stock"
          ]
        }
      }
    }
  }
])
*/

// ====================================
// EXPORTS
// ====================================
module.exports = { app, Product };
