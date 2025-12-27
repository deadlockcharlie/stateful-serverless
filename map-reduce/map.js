// Map function that sends updates to the state manager
// Uses Node.js http module (no external dependencies)

const http = require('http');
const url = require('url');

function sendUpdate(stateManagerUrl, data) {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(stateManagerUrl);
        const postData = JSON.stringify(data);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 80,
            path: parsedUrl.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = http.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    resolve(JSON.parse(responseData));
                } catch (e) {
                    resolve({ error: 'Failed to parse response' });
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.write(postData);
        req.end();
    });
}

module.exports = async function(context) {
    const body = context.request.body;
    const text = body.text || '';
    const sessionId = body.session_id || 'default';
    const stateManagerUrl = body.state_manager_url || process.env.STATE_MANAGER_URL;
    
    // Generate unique node ID for this mapper
    const nodeId = `mapper-${Math.random().toString(36).substr(2, 9)}`;
    
    // Tokenize and count
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    const wordCounts = {};
    
    words.forEach(word => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    
    console.log(`[${nodeId}] Processed ${words.length} words, ${Object.keys(wordCounts).length} unique`);
    
    // If state manager URL is provided, send update
    if (stateManagerUrl) {
        try {
            console.log(`[${nodeId}] Sending update to state manager: ${stateManagerUrl}`);
            
            const updateResult = await sendUpdate(stateManagerUrl, {
                operation: 'update',
                session_id: sessionId,
                word_counts: wordCounts,
                node_id: nodeId,
                timestamp: Date.now()
            });
            
            console.log(`[${nodeId}] State manager response:`, updateResult);
            
            return {
                status: 200,
                body: {
                    node_id: nodeId,
                    word_counts: wordCounts,
                    word_count: words.length,
                    unique_words: Object.keys(wordCounts).length,
                    state_updated: true,
                    state_manager_response: updateResult
                }
            };
        } catch (error) {
            console.error(`[${nodeId}] Error updating state manager:`, error.message);
            
            // If state manager fails, still return local results
            return {
                status: 200,
                body: {
                    node_id: nodeId,
                    word_counts: wordCounts,
                    word_count: words.length,
                    unique_words: Object.keys(wordCounts).length,
                    state_updated: false,
                    error: error.message
                }
            };
        }
    }
    
    console.log(`[${nodeId}] No state manager URL provided`);
    
    // No state manager - return local results only
    return {
        status: 200,
        body: {
            node_id: nodeId,
            word_counts: wordCounts,
            word_count: words.length,
            unique_words: Object.keys(wordCounts).length,
            state_updated: false,
            message: 'No state manager URL provided'
        }
    };
};