const fs = require('fs');
const path = require('path');
const prompt = require('prompt-sync')({ sigint: true });
const OpenAI = require('openai');

const systemPrompt = `You are an AI assistant that classifies posts. say if each post is somehow related to computer programming or not.`;

async function getAvailableDirectories() {
    const postsDir = 'posts';
    const keywords = fs.readdirSync(postsDir);
    
    const options = [];
    
    keywords.forEach(keyword => {
        const datesPath = path.join(postsDir, keyword);
        const dates = fs.readdirSync(datesPath);
        
        dates.forEach(date => {
            const hoursPath = path.join(datesPath, date);
            const hours = fs.readdirSync(hoursPath);
            
            hours.forEach(hour => {
                options.push({
                    keyword,
                    date,
                    hour,
                    path: path.join(hoursPath, hour)
                });
            });
        });
    });
    
    return options;
}

async function classifyPosts(posts, openai) {
    const batchSize = 10;
    const results = [];

    for (let i = 0; i < posts.length; i += batchSize) {
        console.log(`Processing batch ${i / batchSize + 1}...`);
        const batch = posts.slice(i, i + batchSize);
        
        try {
            const response = await openai.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: systemPrompt + " Return a JSON object with numeric keys (0-9) mapping to boolean values, where true means programming-related and false means not programming-related.",
                    },
                    {
                        role: "user",
                        content: JSON.stringify(batch),
                    },
                ],
                model: "gpt-3.5-turbo",
                response_format: { type: "json_object" }
            });

            try {
                const parsedResponse = JSON.parse(response.choices[0].message.content);
                const batchResults = Object.values(parsedResponse);
                results.push(...batchResults);
            } catch (parseError) {
                console.error('Error parsing response:', parseError);
                results.push(...new Array(batch.length).fill(false));
            }
            
            if (i + batchSize < posts.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error(`Error processing batch ${i / batchSize + 1}:`, error);
            results.push(...new Array(batch.length).fill(false));
        }
    }

    return results;
}

async function main() {
    try {
        const apiKey = process.env.OPENAI_API_KEY || prompt('Enter your OpenAI API key: ');
        const openai = new OpenAI({
            apiKey: apiKey
        });

        const options = await getAvailableDirectories();
        
        console.log('\nAvailable post collections:');
        options.forEach((opt, index) => {
            console.log(`${index + 1}. ${opt.keyword} - ${opt.date} - ${opt.hour}`);
        });

        const choice = parseInt(prompt('\nSelect a number: ')) - 1;
        if (choice < 0 || choice >= options.length) {
            console.log('Invalid selection');
            return;
        }

        const selected = options[choice];
        
        // Find JSON files in the directory
        const files = fs.readdirSync(path.join('posts', selected.keyword, selected.date, selected.hour))
            .filter(file => file.endsWith('.json'));

        if (files.length === 0) {
            console.log('No JSON files found in directory');
            return;
        }

        // Read and combine all posts from JSON files
        const allPosts = [];
        for (const file of files) {
            const filePath = path.join('posts', selected.keyword, selected.date, selected.hour, file);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const postData = JSON.parse(fileContent);
            if (Array.isArray(postData)) {
                allPosts.push(...postData);
            } else if (postData.posts) {
                allPosts.push(...postData.posts);
            } else {
                allPosts.push(postData);
            }
        }

        if (allPosts.length === 0) {
            console.log('No posts found in files');
            return;
        }

        console.log('\nClassifying posts...');
        const classifications = await classifyPosts(allPosts.map(p => p.text), openai);

        console.log('\nResults:');
        allPosts.forEach((post, index) => {
            console.log(`\nPost ${index + 1}:`);
            console.log(`Text: ${post.text}`);
            console.log(`Programming-related: ${classifications[index]}`);
            console.log('---');
        });

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main(); 