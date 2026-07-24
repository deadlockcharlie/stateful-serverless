module.exports = async function(context) {
  const { text, stateManagerUrl } = context.request.body;
  const nodeId = `mapper-${Math.random().toString(36).substr(2, 9)}`;

  const t0 = performance.now();

  const frequencyMap = {};
  const lowerCaseText = text.toLowerCase();

  const characters = lowerCaseText.split(''); //array of the lower case caracters 

  characters.forEach(character => {
      if (character >= "a" && character <= "z"){
          frequencyMap[character] = (frequencyMap[character] || 0) + 1; // the map with all characters
      }
  });
  const t1 = performance.now();
  const computeMs = t1 - t0;

  //update to the State Manager
  try {
    const response = await fetch(stateManagerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'update',
        char_counts: frequencyMap,
        node_id: nodeId
      })
    });

    const t2 = performance.now();
    const updateMs = t2 - t1;

    if (!response.ok) {
      console.error(`[${nodeId}] State manager rejected update: ${response.status}`);
    }

    const result = await response.json();
    
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        message: `Mapper ${nodeId} successfully pushed to store`,
        serverReceived: result,
        timing: {
          nodeId,
          computeMs: Number(computeMs.toFixed(2)),
          updateMs: Number(updateMs.toFixed(2)),
          totalMs: Number((computeMs + updateMs).toFixed(2))
        }
      }
    };
  } catch (error) {
    return {
      status: 500,
      body: { error: `Connection to state manager failed: ${error.message}` }
    };
  }
};