const productRepository = require('../repositories/productRepository');

async function getAllProducts() {
  return productRepository.findAll();
}

async function getProductById(id) {
  return productRepository.findById(id);
}

module.exports = {
  getAllProducts,
  getProductById,
};
