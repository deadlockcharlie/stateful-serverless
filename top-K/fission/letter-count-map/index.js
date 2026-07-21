module.exports = async function(context) {
  const { text, stateManagerUrl } = context.request.body;
  const nodeId = `mapper-${Math.random().toString(36).substr(2, 9)}`;

  const frequencyMap = {};
  const lowerCaseText = text.toLowerCase();

  const characters = lowerCaseText.split(''); //array of the lower case caracters 

  characters.forEach(character => {
      if (character >= "a" && character <= "z"){
          frequencyMap[character] = (frequencyMap[character] || 0) + 1; // the map with all characters
      }
  });
  // Fire update to the State Manager
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

    const result = await response.json();
    
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { message: `Mapper ${nodeId} successfully pushed to store`, serverReceived: result }
    };
  } catch (error) {
    return {
      status: 500,
      body: { error: `Connection to state manager failed: ${error.message}` }
    };
  }
};