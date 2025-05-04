const axios = require('axios');
const prompt = require('prompt-sync')({ sigint: true });
const fs = require('fs');
const path = require('path');
const cache_path = `${process.env.HOME}/.cache/bluesky_cache`;
const limit = 100;

function getCurrentDateAndHour() {
    const now = new Date();
    now.setHours(now.getHours() - 1);
    const date = now.toISOString().split('T')[0];
    const hour = now.getUTCHours().toString().padStart(2, '0');
    return { date, hour };
}

async function fetchPostBatch(token, keyword, startTime, endTime, cursor = null) {
    console.log(`Fetching batch: keyword: ${keyword}, startTime: ${startTime}, endTime: ${endTime}`);
    try {
        const response = await axios.get('https://bsky.social/xrpc/app.bsky.feed.searchPosts', {
            headers: {
            'Authorization': `Bearer ${token}`
        },
        params: {
                q: `${keyword} since:${startTime} until:${endTime}`,
                limit: limit,
                cursor: cursor
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching posts:', error.response?.data || error.message);
        return null;
    }
}

async function fetchAllPosts(token, keyword, startTime, endTime) {
    console.log(`Fetching all posts: keyword: ${keyword}, startTime: ${startTime}, endTime: ${endTime}`);
    let allPosts = [];
    let cursor = null;
    let hasMore = true;

    while (hasMore) {
        console.log(`Fetching batch${cursor ? ` (cursor: ${cursor})` : ''}...`);
        const batchData = await fetchPostBatch(token, keyword, startTime, endTime, cursor);
        
        if (batchData.posts && batchData.posts.length > 0) {
            allPosts = allPosts.concat(batchData.posts);
            cursor = batchData.cursor;
            hasMore = !!cursor;
            
            if (hasMore) {
                // Wait 5 seconds before next request
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } else {
            hasMore = false;
        }
    }
    console.log(`Found ${allPosts.length} posts`);
    return { posts: allPosts };
}

async function fetchPosts(keyword, date, hour) {
    try {
        // create the cache directory if it doesn't exist
        fs.mkdirSync(cache_path, { recursive: true });

        // Read the token from the file
        const tokenData = JSON.parse(fs.readFileSync('bluesky_token.json', 'utf8'));
        const token = tokenData.token;

        // If keyword is not provided, prompt for it
        keyword = keyword || prompt('Enter keyword to search: ');

        // If date or hour is not provided, ask if user wants current hour
        if (!date || !hour) {
            const useCurrentTime = prompt('Do you want to fetch posts from the most recent hour? (y/n): ').toLowerCase();
            
            if (useCurrentTime === 'y') {
                const current = getCurrentDateAndHour();
                date = current.date;
                hour = current.hour;
                console.log(`Using current date: ${date} and hour: ${hour}`);
            } else {
                date = date || prompt('Enter date (YYYY-MM-DD): ');
                hour = hour || prompt('Enter hour (00-23): ');
            }
        }

        // Pad hour with leading zero if needed
        hour = hour.toString().padStart(2, '0');

        // Create the directory structure
        const dirPath = path.join('posts', keyword, date, hour);
        fs.mkdirSync(dirPath, { recursive: true });

        console.log(`Fetching posts for keyword "${keyword}" on ${date} at ${hour}:00...`);

        // Calculate the time range for the given hour
        const startTime = new Date(`${date}T${hour}:00:00Z`).toISOString();
        const endTime = new Date(`${date}T${hour}:59:59Z`).toISOString();

        let posts;
        // check if the cache file exists
        const cacheFilePath = path.join(cache_path, `${keyword}_${date}_${hour}.json`);

        if (fs.existsSync(cacheFilePath)) {
            console.log(`Cache file found for ${keyword} on ${date} at ${hour}:00. Loading from cache...`);
            posts = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        } else {
            // Make the API request to Bluesky with date range parameters
            posts = await fetchAllPosts(token, keyword, startTime, endTime);
            // store the response in a cache file under the key of the keyword, date, and hour
            fs.writeFileSync(cacheFilePath, JSON.stringify(posts, null, 2));
        }   

        // Format each post and save individually
        const formattedPosts = posts.posts.map(post => ({
            text: post.record.text,
            author: post.author.handle,
            timestamp: post.indexedAt,
            uri: post.uri,
            cid: post.cid
        }));

        // Save each post to its own file
        formattedPosts.forEach((post, index) => {
            const fileName = `post_${(index + 1).toString().padStart(4, '0')}_${post.author}_${date}_${hour}.json`;
            const filePath = path.join(dirPath, fileName);
            fs.writeFileSync(filePath, JSON.stringify(post, null, 2));
        });

        console.log(`Found ${formattedPosts.length} posts`);
        console.log(`Results saved to: ${dirPath}`);

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

// Check if arguments are provided via command line
const [,, keyword, date, hour] = process.argv;

// Execute the function
fetchPosts(keyword, date, hour); 