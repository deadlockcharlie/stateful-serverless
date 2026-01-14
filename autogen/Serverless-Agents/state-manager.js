// CommonJS wrapper for ES Module state-manager
// This loads the ES module at runtime using dynamic import()

module.exports = async function(context) {
  try {
    // Dynamic import of the ES module
    const { default: handler } = await import('./state-manager.mjs');
    
    // Call the actual handler
    return await handler(context);
  } catch (error) {
    console.error('Error loading or executing state-manager:', error);
    return {
      status: 500,
      body: {
        error: 'Internal server error',
        message: error.message
      }
    };
  }
};
