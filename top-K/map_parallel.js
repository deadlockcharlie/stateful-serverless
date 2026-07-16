export async function countLetters(text, stateManagerUrl) {
    const nodeId = `mapper-${Math.random().toString(36).substr(2, 9)}`;

    const frequencyMap = {};
    let mainChar = "";
    let maxCount = 0;

    const lowerCaseText = text.toLowerCase();
    const characters = lowerCaseText.split(''); //array of the lower case caracters 

    characters.forEach(character => {
        if (character >= "a" && character <= "z"){
            frequencyMap[character] = (frequencyMap[character] || 0) + 1; // the map with all characters
        }
    });

    // since frequencyMap is originally not an object 
    Object.entries(frequencyMap).forEach(([char, number]) => {
        if (number > maxCount){
            maxCount = number;
            mainChar = char;
        }
    });

    const updateResult = {
        operation: 'update',
        char_counts: frequencyMap, 
        node_id: nodeId,
        timestamp: Date.now()
      };

    try {
        console.log(`[${nodeId}] Sending update to state manager`);
        const response = await fetch(stateManagerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateResult)
        });
    
        if (response.ok) {
          const result = await response.json();
          console.log(`[${nodeId}] Success Response:`, result.message);
        } else {
          console.error(`[${nodeId}] State Manager rejected the update.`);
        }
      } catch (error) {
        console.error(`[${nodeId}] Connection failed:`, error.message);
      }

    return {
        mainCharacter: { char: mainChar, count: maxCount }
    }
}
