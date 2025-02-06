#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import clear from 'clear';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';
import dotenv from 'dotenv';
import os from 'os';

// Constants
const API_URL = 'https://filesharingcli-production.up.railway.app';
const DOWNLOAD_DIR = path.join(os.homedir(), 'Downloads', 'cfileshare');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB in bytes

// Create downloads directory if it doesn't exist
try {
    if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    }
} catch (error) {
    console.error(styles.error(`\nError creating downloads directory: ${error.message}`));
    process.exit(1);
}

// Simple styles
const styles = {
    title: chalk.cyan.bold,
    error: chalk.red,
    success: chalk.green,
    info: chalk.cyan,
    menu: chalk.white,
    endpoint: chalk.magenta.italic,
};

// Box characters
const box = {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
};

// Show header
function showHeader() {
    clear();
    console.log(styles.title('\n     CShare - Secure File Sharing\n'));
}

// Main menu
async function showMainMenu() {
    showHeader();
    const { option } = await inquirer.prompt([
        {
            type: 'list',
            name: 'option',
            message: 'Select an option:',
            choices: [
                '📂 Access Endpoint',
                '✨ Create Endpoint',
                '🚪 Exit'
            ]
        }
    ]);

    switch (option) {
        case '📂 Access Endpoint':
            await accessEndpoint();
            break;
        case '✨ Create Endpoint':
            await createEndpoint();
            break;
        case '🚪 Exit':
            process.exit(0);
    }
}

// Access endpoint
async function accessEndpoint() {
    showHeader();
    try {
        const { endpointName, password } = await inquirer.prompt([
            {
                type: 'input',
                name: 'endpointName',
                message: 'Endpoint name:',
            },
            {
                type: 'password',
                name: 'password',
                message: 'Password:',
                mask: '*'
            }
        ]);

        console.log(styles.info('\nAccessing endpoint...'));
        try {
            const response = await axios.get(`${API_URL}/site/${endpointName}`, { params: { password } });

            if (response.data.auth_token) {
                fs.writeFileSync('.env', `auth_token=${response.data.auth_token}`);
                await showFileManager(endpointName, response.data.files || [], password);
            }
        } catch (error) {
            if (error.response) {
                // Handle specific error codes
                switch (error.response.status) {
                    case 404:
                        console.log(styles.error('\n❌ Error: Endpoint not found'));
                        break;
                    case 401:
                        console.log(styles.error('\n❌ Error: Invalid password'));
                        break;
                    default:
                        console.log(styles.error(`\n❌ Error: ${error.response.data.error || 'Unknown error'}`));
                }
            } else if (error.request) {
                console.log(styles.error('\n❌ Error: Server not responding. Is the server running?'));
            } else {
                console.log(styles.error(`\n❌ Error: ${error.message}`));
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            await showMainMenu();
        }
    } catch (error) {
        console.log(styles.error(`\n❌ Error: ${error.message}`));
        await new Promise(resolve => setTimeout(resolve, 2000));
        await showMainMenu();
    }
}

// Create endpoint
async function createEndpoint() {
    showHeader();
    try {
        const { endpointName, password } = await inquirer.prompt([
            {
                type: 'input',
                name: 'endpointName',
                message: 'New endpoint name:',
            },
            {
                type: 'password',
                name: 'password',
                message: 'Set password:',
                mask: '*'
            }
        ]);

        console.log(styles.info('\nCreating endpoint...'));
        try {
            const response = await axios.post(`${API_URL}/createsite`, {
                site_name: endpointName,
                password: password,
            });

            if (response.data.auth_token) {
                fs.writeFileSync('.env', `auth_token=${response.data.auth_token}`);
                console.log(styles.success('\n✨ Endpoint created successfully!'));
            }
            await showMainMenu();
        } catch (error) {
            if (error.response) {
                // Server responded with error
                const errorMessage = error.response.data.error || error.response.data.message || 'Unknown error';
                console.log(styles.error(`\n❌ Error: ${errorMessage}`));
            } else if (error.request) {
                // Request made but no response
                console.log(styles.error('\n❌ Error: Server not responding. Is the server running?'));
            } else {
                // Other errors
                console.log(styles.error(`\n❌ Error: ${error.message}`));
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            await showMainMenu();
        }
    } catch (error) {
        console.log(styles.error(`\n❌ Error: ${error.message}`));
        await new Promise(resolve => setTimeout(resolve, 2000));
        await showMainMenu();
    }
}

// File manager
async function showFileManager(endpointName, files, password) {
    showHeader();
    console.log(styles.info(`\nEndpoint: ${endpointName}`));
    console.log(styles.endpoint(`GET /site/${endpointName}\n`));

    if (files.length === 0) {
        console.log('No files found\n');
    } else {
        files.forEach((file, index) => {
            console.log(`${index + 1}. 📄 ${file.file_name}`);
        });
        console.log();
    }

    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'Choose action:',
            choices: [
                '📤 Upload File',
                '📥 Download File',
                '🔙 Back to Menu'
            ]
        }
    ]);

    switch (action) {
        case '📤 Upload File':
            await uploadFile(endpointName, password);
            break;
        case '📥 Download File':
            if (files.length > 0) {
                await downloadFile(endpointName, files, password);
            } else {
                console.log(styles.info('\nNo files to download'));
                await showFileManager(endpointName, files, password);
            }
            break;
        case '🔙 Back to Menu':
            await showMainMenu();
            break;
    }
}

// Upload file
async function uploadFile(endpointName, password) {
    try {
        const { filePath } = await inquirer.prompt([
            {
                type: 'input',
                name: 'filePath',
                message: '📂 Enter file path or drag & drop file here:',
                validate: input => {
                    input = input.trim().replace(/["']/g, '');
                    if (!input) return 'File path is required';
                    if (!fs.existsSync(input)) return 'File does not exist';
                    
                    // Check file size
                    const stats = fs.statSync(input);
                    if (stats.size > MAX_FILE_SIZE) {
                        return 'File size exceeds maximum limit of 5MB';
                    }
                    
                    return true;
                },
                filter: input => input.trim().replace(/["']/g, '')
            }
        ]);

        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath));
        const authToken = dotenv.parse(fs.readFileSync('.env')).auth_token;

        console.log(styles.info('\n📤 Uploading file...'));
        await axios.post(
            `${API_URL}/upload/${endpointName}`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    Authorization: authToken,
                }
            }
        );

        console.log(styles.success('\n✨ File uploaded successfully!'));
        const siteResponse = await axios.get(
            `${API_URL}/site/${endpointName}`,
            { params: { password } }
        );
        await showFileManager(endpointName, siteResponse.data.files || [], password);
    } catch (error) {
        if (error.response?.data?.error) {
            console.log(styles.error(`\n❌ Error: ${error.response.data.error}`));
        } else {
            console.log(styles.error(`\n❌ Error: ${error.message}`));
        }
        await showFileManager(endpointName, [], password);
    }
}

// Download file
async function downloadFile(endpointName, files, password) {
    try {
        const { fileIndex } = await inquirer.prompt([
            {
                type: 'list',
                name: 'fileIndex',
                message: 'Select file to download:',
                choices: files.map((file, index) => ({
                    name: file.file_name,
                    value: index
                }))
            }
        ]);

        const selectedFile = files[fileIndex];
        const authToken = dotenv.parse(fs.readFileSync('.env')).auth_token;

        console.log(styles.info('\nDownloading file...'));
        const response = await axios.get(
            `${API_URL}/getfile/${selectedFile.id}`,
            {
                headers: { Authorization: authToken },
                responseType: 'arraybuffer'
            }
        );

        const downloadPath = path.join(DOWNLOAD_DIR, selectedFile.file_name);
        fs.writeFileSync(downloadPath, response.data);
        console.log(styles.success(`\n✨ File downloaded to: ${downloadPath}`));
        await showFileManager(endpointName, files, password);
    } catch (error) {
        console.log(styles.error(`\n❌ Error: ${error.response?.data?.error || error.message}`));
        await showFileManager(endpointName, files, password);
    }
}

// Start the application
showMainMenu().catch(error => console.error(styles.error('Error:', error))); 