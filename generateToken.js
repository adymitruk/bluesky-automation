const axios = require('axios');
const prompt = require('prompt-sync')({ sigint: true });
const fs = require('fs');

(async () => {
    try {
        console.log("Bluesky Token Generator");

        // Prompt for Bluesky username and password
        const username = prompt("Enter your Bluesky username (email or handle): ");
        const password = prompt("Enter your Bluesky password: ", { echo: '*' });

        console.log("Logging in to Bluesky...");

        // Login to Bluesky and get the session token
        const loginResponse = await axios.post('https://bsky.social/xrpc/com.atproto.server.createSession', {
            identifier: username,
            password: password,
        });

        const { accessJwt } = loginResponse.data;

        console.log("Login successful! Token generated.");

        // Save the token to a file
        fs.writeFileSync('bluesky_token.json', JSON.stringify({ token: accessJwt }, null, 2));

        console.log("Token saved to 'bluesky_token.json'. You can use it for future API calls.");
    } catch (error) {
        console.error("An error occurred:", error.response?.data || error.message);
    }
})();
