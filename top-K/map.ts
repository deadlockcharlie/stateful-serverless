import * as fs from 'node:fs/promises';

interface AnalysisResult {
    fullMap: Record<string, number>;
    mainCharacter: {
      char: string;
      count: number;
    };
  }

function countLetters(text: string): AnalysisResult {
    const frequencyMap: Record<string, number> = {};
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

    return {
        fullMap: frequencyMap,
        mainCharacter: { char: mainChar, count: maxCount }
    }
}

/*
const sampleText = "Hello, nice to meet you";
const result = countLetters(sampleText);

console.log(`Top-K is '${result.mainCharacter.char}' which appeared ${result.mainCharacter.count} times`);
console.log(`Total reults:`, JSON.stringify(result.fullMap, null, 2));
*/
async function main(){
    try {
        const filename = './sample.txt';
        console.log(`Opening file: ${filename}`);

        const fileContent = await fs.readFile(filename, 'utf-8');

        const result = countLetters(fileContent);
    
        console.log(`\n Top-K is '${result.mainCharacter.char}' which appeared ${result.mainCharacter.count} times.`);
        console.log(`Total results:`, JSON.stringify(result.fullMap, null, 2));
    
      } catch (error: any) {
        console.error("Something went wrong:", error.message);
      }
}

main();