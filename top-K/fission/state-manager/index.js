let cachedHandler = null;

module.exports = async function(context) {
  try {
    // Only import the ES Module ONCE on the very first request
    if (!cachedHandler) {
      console.log("[Bootstrapper] First run: Dynamically loading ES Module state-manager.mjs");
      const { default: handler } = await import('./state-manager.mjs');
      cachedHandler = handler;
    }
    
    // Execute the cached handler instantly
    return await cachedHandler(context);
  } catch (error) {
    console.error('Error executing proxy state-manager:', error);
    return {
      status: 500,
      body: { error: 'Internal server error', message: error.message }
    };
  }
};