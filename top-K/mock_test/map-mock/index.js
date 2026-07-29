module.exports = async function (context) {
    // Does nothing except prove the container spun up and responded.
    return {
      status: 200,
      body: JSON.stringify({
        ok: true,
        pod: process.env.HOSTNAME || "unknown",
        receivedAt: Date.now()
      })
    };
  };