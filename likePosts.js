const fs = require('fs');
const path = require('path');
const prompt = require('prompt-sync')({ sigint: true });
const axios = require('axios');
const delay_between_likes = 5000;
const variance_limit = 3000;

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
                const onTopicPath = path.join(hoursPath, hour, 'on-topic');
                if (fs.existsSync(onTopicPath)) {
                    options.push({
                        keyword,
                        date,
                        hour,
                        path: onTopicPath
                    });
                }
            });
        });
    });
    
    return options;
}

// Get the user's DID once at the start
let myDid = null;

async function initializeSession(token) {
    try {
        const response = await axios.get('https://bsky.social/xrpc/com.atproto.server.getSession', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        myDid = response.data.did;
        console.log(`Initialized session with DID: ${myDid}`);
        return true;
    } catch (error) {
        console.error('Error initializing session:', error.response?.data || error.message);
        return false;
    }
}

async function likePost(uri, cid, token) {
    try {
        if (!myDid) {
            console.error('Session not initialized. Please call initializeSession first');
            return false;
        }
        
        console.log(`Using my DID: ${myDid}`);
        console.log(`Liking post URI: ${uri}`);
        console.log(`Post CID: ${cid}`);

        const request = {
            repo: myDid,
            collection: 'app.bsky.feed.like',
            record: {
                subject: { uri, cid },
                createdAt: new Date().toISOString(),
            }
        }   
        console.log(`Like request: ${JSON.stringify(request)}`);
        
        const response = await axios.post(
            'https://bsky.social/xrpc/com.atproto.repo.createRecord',
            request,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        console.log(`Successfully liked the post.`);
        return true;
    } catch (error) {
        console.error('Error liking post:', error.response?.data || error.message);
        return false;
    }
}

async function main() {
    try {
        // Read the token
        const tokenData = JSON.parse(fs.readFileSync('bluesky_token.json', 'utf8'));
        const token = tokenData.token;

        const options = await getAvailableDirectories();
        
        console.log('\nAvailable on-topic post collections:');
        options.forEach((opt, index) => {
            console.log(`${index + 1}. ${opt.keyword} - ${opt.date} - ${opt.hour}`);
        });

        const choice = parseInt(prompt('\nSelect a number: ')) - 1;
        if (choice < 0 || choice >= options.length) {
            console.log('Invalid selection');
            return;
        }

        const selected = options[choice];
        const onTopicDir = selected.path;
        const failedDir = path.join(path.dirname(onTopicDir), 'failed');
        fs.mkdirSync(failedDir, { recursive: true });
        const likedDir = path.join(path.dirname(onTopicDir), 'liked');
        fs.mkdirSync(likedDir, { recursive: true });

        // Find JSON files in the on-topic directory
        const files = fs.readdirSync(onTopicDir)
            .filter(file => file.endsWith('.json'));

        if (files.length === 0) {
            console.log('No JSON files found in on-topic directory');
            return;
        }
        // get the did
        await initializeSession(token);

        console.log('\nProcessing posts...');
        for (const file of files) {
            const filePath = path.join(onTopicDir, file);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const post = JSON.parse(fileContent);

            // check if the post has already been liked or failed
            const baseFileName = file.split('_').slice(0, 2).join('_');  // Get first 2 elements like post_0035
            const likedFiles = fs.readdirSync(likedDir);
            const failedFiles = fs.readdirSync(failedDir);
            
            // Check if any files in liked or failed directories start with the base name
            if (likedFiles.some(f => f.startsWith(baseFileName)) || failedFiles.some(f => f.startsWith(baseFileName))) {
                console.log(`Post ${file} already liked or failed`);
                continue;
            }

            console.log(`\nLiking post by ${post.author}:`);
            console.log(`Text: ${post.text.substring(0, 100)}...`);

            const success = await likePost(post.uri, post.cid, token);
            
            if (success) {
                console.log(`Successfully liked post ${file}`);
                // Store a record of liking the post using the name of the file and a timestamp at the end of the file name in the liked directory as a symlink
                const targetPath = path.join(likedDir, file.replace('.json', '') + '_' + new Date().toISOString() + '.json');
                fs.symlinkSync(filePath, targetPath);
            } else {
                console.log(`Failed to like post ${file}`);
                // Store a record of failing to like the post using the name of the file and a timestamp at the end of the file name in the failed directory as a symlink
                const targetPath = path.join(failedDir, file.replace('.json', '') + '_' + new Date().toISOString() + '.json');
                fs.symlinkSync(filePath, targetPath);
            }

            // Add a delay between likes to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, delay_between_likes + Math.floor(Math.random() * variance_limit)));
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main(); 