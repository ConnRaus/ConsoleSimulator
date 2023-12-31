// Console elements
const inputElement = document.getElementById('command-input');
const outputElement = document.getElementById('output-text');
const outputContainer = document.getElementById('output');
// Editor elements
const editorContainer = document.getElementById('editor');
const editorTextArea = document.getElementById('editor-textarea');
const editorFileName = document.getElementById('editor-filename');
const editorHeader = document.getElementById('editor-header');
const linenumbers = document.getElementById('editor-linenumbers');


// Load username
let username = 'user';
const savedUsername = localStorage.getItem('username');
if (savedUsername) {
    username = savedUsername;
}

// Get user os
const os = navigator?.userAgentData?.platform || navigator?.platform || 'unknown'

// global variables
let pyodideInstance = null;
let editMode = false;
let runningProgram = false;
let currentFile = null;
let autosave = true;

// set up aliases
let aliases = {
    'l': 'ls',
    'll': 'ls -l',
    'la': 'ls -a',
    '..': 'cd ..',
    'vi': 'edit',
    'vim': 'edit',
    'nano': 'edit',
    'code': 'edit',
    'view': 'viewimg',
    'show': 'viewimg',
    'setname': 'setuser',
    'setusername': 'setuser',
    'changeuser': 'setuser',
    'changeusername': 'setuser',
    'changename': 'setuser',
    'dl': 'download',
}

// Define the default file system structure
let fileSystem = {
    root: {
        name: '/',
        type: 'directory',
        parent: null,
        children: {},
    },
};
let currentDirectory = fileSystem.root;

// Manually set parent pointers
Object.values(fileSystem.root.children).forEach(directory => {
    directory.parent = fileSystem.root;
    if (directory.children) {
        Object.values(directory.children).forEach(child => {
            child.parent = directory;
        });
    }
});




// Load saved file system 
const savedFileSystem = localStorage.getItem('fileSystem');
if (savedFileSystem) {
    fileSystem = JSON.parse(savedFileSystem);

    // Restore parent pointers
    function restoreParents(directory) {
        if (directory.children) {
            Object.values(directory.children).forEach(child => {
                child.parent = directory;
                if (child.type === 'directory') {
                    restoreParents(child);
                }
            });
        }
    }
    restoreParents(fileSystem.root);
    currentDirectory = fileSystem.root;
}

// Load saved aliases
const savedAliases = localStorage.getItem('aliases');
if (savedAliases) {
    aliases = JSON.parse(savedAliases);
}

// load autosave setting
const autosaveSetting = localStorage.getItem('autosave');
if (autosaveSetting) {
    autosave = JSON.parse(autosaveSetting);
}

// if user is on iphone or ipad, append 50 newlines to output
if (navigator.userAgent.match(/iPhone/i) || navigator.userAgent.match(/iPad/i)) {
    for (let i = 0; i < 50; i++) {
        appendToOutput('');
    }
}

// Cant have filesystem point parents to children while children point to parents, so clone without parents and add back later
function cloneFileSystemWithoutParents(fileSystem) {
    function removeParents(directory) {
        let newDir = {};
        newDir.name = directory.name;
        newDir.type = directory.type;
        if (directory.type === 'directory' && directory.children) {
            newDir.children = {};
            for (let childName in directory.children) {
                newDir.children[childName] = removeParents(directory.children[childName]);
            }
        } else if (directory.type === 'file') {
            newDir.content = directory.content;
        }
        return newDir;
    }
    let clonedRoot = removeParents(fileSystem.root);
    return { root: clonedRoot };
}

// Define the function to get the path to a directory from the root of the file system
function getPathToRoot(directory) {
    let path = [];
    while (directory) {
        path.unshift(directory.name);
        directory = directory.parent;
    }
    return path;
}

function updatePrompt() {
    const userSpan = document.getElementById('user-span');
    const pathSpan = document.getElementById('path-span');
    const promptSpan = document.getElementById('prompt-span');

    userSpan.textContent = `${username}@${os}`;
    let currentPath = getPathToRoot(currentDirectory).join('/');
    currentPath = currentPath.replace(/,/g, '/');
    currentPath = currentPath.substring(1);
    pathSpan.textContent = `~${currentPath}`;
    promptSpan.innerHTML = "$&nbsp;";
}

// Handle command execution
function executeCommand() {

    // Get the command from the input element
    let command = inputElement.value.trim();

    // Clear the input field
    inputElement.value = '';

    // Get current directory and replace , with /
    let currentPath = getPathToRoot(currentDirectory).join('/');
    currentPath = currentPath.replace(/,/g, '/');
    currentPath = currentPath.substring(1);

    // Append the command to the output area
    appendToOutput(`<span class="command-line"><span class="promptuser">${username}@${os}</span><span>:</span><span class="promptpath">~${currentPath}</span><span class="prompt">$ </span><span">${command}</span></span>`, true);

    // if command is alias, then replace command with actual command
    // only replace first word
    let commandParts = command.split(' ');
    let commandName = commandParts.shift();
    if (aliases[commandName]) {
        command = aliases[commandName] + ' ' + commandParts.join(' ');
    }
    
    // remove trailing spaces from command
    command = command.trim();

    // Process the command
    processCommand(command);
}

// Process the command
function processCommand(command) {

    let commandParts = command.split(' ');
    let commandName = commandParts.shift();
    let flags = [];
    let args = [];

    commandParts.forEach(part => {
        if (part.startsWith('-')) {
            // Remove '-' and add each character as a flag
            flags.push(...part.slice(1).split(''));
        } else {
            args.push(part);
        }
    });

    switch (commandName) {
        case 'help':
            helpCommand(flags, args);
            break;
        case 'ls':
            lsCommand(flags, args);
            break;
        case 'cd':
            cdCommand(flags, args);
            break;
        case 'mv':
            mvCommand(flags, args);
            break;
        case 'cp':
            cpCommand(flags, args);
            break;
        case 'cat':
            catCommand(flags, args);
            break;
        case 'echo':
            appendToOutput(args.join(' '));
            break;
        case 'viewimg':
            viewimgCommand(flags, args);
            break;
        case 'pwd':
            pwdCommand();
            break;
        case 'mkdir':
            mkdirCommand(flags, args);
            break;
        case 'touch':
            touchCommand(flags, args);
            break;
        case 'rm':
            rmCommand(flags, args);
            break;
        case 'rmdir':
            rmdirCommand(flags, args);
            break;
        case 'edit':
            editCommand(flags, args);
            break;
        case 'python':
            if (pyodideInstance === null) {
                appendToOutput('<span style="color:yellow">Loading Python... (this only happens once)</span>', true);
                // wait for loadPyodideInstance to finish
                (async () => {
                    runningProgram = true;
                    try {
                        await loadPyodideInstance();
                    } catch (e) {
                        appendToOutput('<span style="color:red">Python encountered an error, some things may not work properly</span>', true);
                        appendToOutput(e.message);
                        runningProgram = false;
                        return;
                    }
                    appendToOutput('<span style="color:limegreen">Python loaded successfully</span>', true);
                    pythonCommand(flags, args);
                })();
            } else {
                pythonCommand(flags, args);
            }
            break;
        case 'download':
            downloadCommand(flags, args);
            break;
        case 'df':
            dfCommand(flags, args);
            break;
        case 'clear':
            clearCommand();
            break;
        case 'alias':
            aliasCommand(flags, args);
            break;
        case 'unalias':
            unaliasCommand(flags, args);
            break;
        case 'setuser':
            newname = args[0];
            if (newname) {
                username = newname;
                appendToOutput(`Username changed to ${username}`);
            } else {
                appendToOutput('No username given');
            }
            break;
        case 'save':
            // Save the current state
            saveCommand(flags, args);
            appendToOutput('Saved filesystem');
            break;
        case 'autosave':
            // Toggle autosave
            autosave = !autosave;
            localStorage.setItem('autosave', autosave);
            appendToOutput(`Autosave is now ${autosave ? 'ON' : 'OFF'}`);
            break;
        case 'wasm':
            wasmCommand(flags, args);
            break;
        case 'copyfilesystem':
            navigator.clipboard.writeText(JSON.stringify(cloneFileSystemWithoutParents(fileSystem)));
            appendToOutput('Filesystem copied to clipboard');
            break;
        // if nothing, do nothing
        case '':
            break;
        default:
            appendToOutput(`${commandName}: command not found`);
    }
}

// 'help' command
function helpCommand(flags, args) {
    if (args.length === 0) {
        appendToOutput('Commands:');
        appendToOutput('help - display this help');
        appendToOutput('ls - list files and directories');
        appendToOutput('cd - change directory');
        appendToOutput('mv - move file or directory');
        appendToOutput('cat - print file contents');
        appendToOutput('echo - print arguments');
        appendToOutput('viewimg - displays base64 image');
        appendToOutput('pwd - print working directory');
        appendToOutput('mkdir - make directory');
        appendToOutput('touch - create file');
        appendToOutput('rm - remove file or directory');
        appendToOutput('rmdir - remove directory');
        appendToOutput('edit - edit file');
        appendToOutput('python - run python file');
        appendToOutput('download - download files');
        appendToOutput('df - display filesystem usage')
        appendToOutput('clear - clear the screen');
        appendToOutput('alias - create alias for command');
        appendToOutput('unalias - remove alias for command');
        appendToOutput('setuser - change username');
        appendToOutput('save - save filesystem state(persists on refresh)');
        appendToOutput('autosave - toggle autosave');
    }

    // help
    else if (args[0] === 'help') {
        appendToOutput('help - display this help');
        appendToOutput('Usage: help [command]');
    }
    // ls
    else if (args[0] === 'ls') {
        appendToOutput('ls - list files and directories');
        appendToOutput('Usage: ls [-l] [-a] [directory]');
        appendToOutput('Options:');
        appendToOutput('  -l: use a long listing format');
        appendToOutput('  -a: list all files including hidden files');
    }
    // cd
    else if (args[0] === 'cd') {
        appendToOutput('cd - change directory');
        appendToOutput('Usage: cd [directory]');
    }
    // mv
    else if (args[0] === 'mv') {
        appendToOutput('mv - move file or directory');
        appendToOutput('Usage: mv [source] [target]');
    }
    // cat 
    else if (args[0] === 'cat') {
        appendToOutput('cat - print file contents');
        appendToOutput('Usage: cat [file]');
    }
    // echo
    else if (args[0] === 'echo') {
        appendToOutput('echo - print arguments');
        appendToOutput('Usage: echo [arg1] [arg2] ...');
    }
    // viewimg
    else if (args[0] === 'viewimg') {
        appendToOutput('viewimg - displays base64 image');
        appendToOutput('Usage: viewimg [file]');
    }
    // pwd
    else if (args[0] === 'pwd') {
        appendToOutput('pwd - print working directory');
        appendToOutput('Usage: pwd');
    }
    // mkdir
    else if (args[0] === 'mkdir') {
        appendToOutput('mkdir - make directory');
        appendToOutput('Usage: mkdir [directory]');
    }
    // touch
    else if (args[0] === 'touch') {
        appendToOutput('touch - create file');
        appendToOutput('Usage: touch [file]');
    }
    // rm
    else if (args[0] === 'rm') {
        appendToOutput('rm - remove file or directory');
        appendToOutput('Usage: rm [-r] [file or directory]');
        appendToOutput('Options:');
        appendToOutput('  -r: remove directories and their contents recursively');
    }
    // rmdir
    else if (args[0] === 'rmdir') {
        appendToOutput('rmdir - remove directory');
        appendToOutput('Usage: rmdir [directory]');
    }
    // edit 
    else if (args[0] === 'edit') {
        appendToOutput('edit - edit file');
        appendToOutput('Usage: edit [file]');
    }
    // python
    else if (args[0] === 'python') {
        appendToOutput('python - run python file');
        appendToOutput('Usage: python [file] [arg1] [arg2] ...');
        appendToOutput('Note: python files only print after finishing execution');
        appendToOutput('Supported external libraries:');
        appendToOutput('  matplotlib, numpy, pandas, scipy, scikit-learn, seaborn, statsmodels, regex');
    }
    //download
    else if (args[0] === 'download') {
        appendToOutput('download - download files');
        appendToOutput('Usage: download [file] [file2] ...');
    }
    //df
    else if (args[0] === 'df') {
        appendToOutput('df - display filesystem usage');
        appendToOutput('Usage: df');
    }
    // clear
    else if (args[0] === 'clear') {
        appendToOutput('clear - clear the screen');
        appendToOutput('Usage: clear');
    }
    // alias
    else if (args[0] === 'alias') {
        appendToOutput('alias - create alias for command');
        appendToOutput('Usage: alias [alias] [command]');
    }
    // unalias
    else if (args[0] === 'unalias') {
        appendToOutput('unalias - remove alias for command');
        appendToOutput('Usage: unalias [alias]');
    }
    // setuser
    else if (args[0] === 'setuser') {
        appendToOutput('setuser - change username');
        appendToOutput('Usage: setuser [username]');
    }
    // save
    else if (args[0] === 'save') {
        appendToOutput('save - save filesystem state(persists on refresh)');
        appendToOutput('Usage: save');
    }
    // autosave
    else if (args[0] === 'autosave') {
        appendToOutput('autosave - toggle autosave');
        appendToOutput('Usage: autosave');
    }
    else {
        appendToOutput("help: no help entry for '" + args[0] + "'.");
    }

}

//  'ls' command
function lsCommand(flags, args) {

    // If flags exist and are not l or a, print ls: invalid option -- 'flag'
    const validFlags = ['l', 'a'];

    for (let i = 0; i < flags.length; i++) {
        if (!validFlags.includes(flags[i])) {
            appendToOutput(`ls: invalid option -- '${flags[i]}'`);
            return;
        }
    }

    let directory = currentDirectory;
    if (args.length > 0) {
        const targetName = args[0];
        const target = directory.children[targetName];
        if (!target || target.type !== 'directory') {
            appendToOutput(`ls: cannot access '${targetName}': No such file or directory`);
            return;
        }
        directory = target;
    }

    // Get the files and directories to list
    let items;
    if (flags.includes('a')) {
        // Include hidden files
        items = Object.entries(directory.children);
    } else {
        // Exclude hidden files
        items = Object.entries(directory.children)
            .filter(([name]) => !name.startsWith('.'));
    }

    // Partition directories and files
    let directories = items.filter(([, item]) => item.type === 'directory');
    let files = items.filter(([, item]) => item.type !== 'directory');

    // Sort each partition
    directories.sort();
    files.sort();

    // Concatenate partitions
    items = directories.concat(files);

    if (flags.includes('l')) {
        // Detailed listing
        items = items.map(([name, item]) => `${item.type[0]}:${name}${item.type === 'directory' ? '/' : ''}`);
    } else {
        // Simple listing
        items = items.map(([name, item]) => `${name}${item.type === 'directory' ? '/' : ''}`);
    }

    if (items.length === 0) {
        appendToOutput('(empty)');
    } else {
        appendToOutput(items.join('  '));
    }
}

//  'cd' command
function cdCommand(flags, args) {

    let directory = args[0];

    // Check directory is not empty
    if (!directory) {
        appendToOutput('cd: no directory specified');
        return;
    }
    // Remove / at end so cd / is the same as cd
    if (directory.length > 1 && directory.endsWith('/')) {
        directory = directory.slice(0, -1);
    }

    if (directory === '..') {
        // Navigate to the parent directory
        currentDirectory = currentDirectory.parent || currentDirectory;
    } else if (directory === '.') {
        // Do nothing, stay in the current directory
    } else if (directory === '/') {
        // Change to the root directory
        currentDirectory = fileSystem.root;
    } else if (
        currentDirectory.children &&
        currentDirectory.children[directory] &&
        currentDirectory.children[directory].type === 'directory'
    ) {
        // Directory exists, change to the specified directory
        currentDirectory = currentDirectory.children[directory];
    } else {
        if (currentDirectory.children[directory] && currentDirectory.children[directory].type === 'file') {
            appendToOutput(`cd: ${directory}: Not a directory`);
        }
        else {
            appendToOutput(`cd: ${directory}: No such file or directory`);
        }
    }
}

// 'mv command'
function mvCommand(flags, args) {
    const sourceName = args[0];
    let targetName = args[1];

    // Check source and target are not empty
    if (!sourceName || !targetName) {
        appendToOutput('mv: missing file operand');
        return;
    }

    // Get the source object
    const source = currentDirectory.children[sourceName];
    if (!source) {
        appendToOutput(`mv: cannot stat '${sourceName}': No such file or directory`);
        return;
    }

    let targetParent = currentDirectory;
    let targetIsDir = false;

    // Special cases for target directory
    if (targetName === '.') {
        targetName = sourceName;
    } else if (targetName === '..') {
        if (currentDirectory.parent) {
            targetParent = currentDirectory.parent;
            targetName = sourceName;
        } else {
            appendToOutput('mv: cannot move to parent of root directory');
            return;
        }
    } else if (targetParent.children[targetName] && targetParent.children[targetName].type === 'directory') {
        // If the target is a directory, set the targetParent to be that directory
        targetParent = targetParent.children[targetName];
        targetName = sourceName;
        targetIsDir = true;
    }

    // Check if a file or directory with the same name already exists in the target directory
    if (targetParent.children[targetName] && !targetIsDir) {
        appendToOutput(`mv: cannot move '${sourceName}' to '${targetName}': File or directory already exists`);
        return;
    }

    // Remove the source from its parent's children
    delete currentDirectory.children[sourceName];

    // Update the source's name only if target isn't a directory
    if (!targetIsDir) {
        source.name = targetName;
    }

    // Add the source to the target's children
    targetParent.children[targetName] = source;

    // Update the parent of the source
    source.parent = targetParent;
}

function deepCopyFile(file) {
    // Create a new object with the same properties as the file
    let newFile = {...file};

    // If the file is a directory, copy its children too
    if (file.type === 'directory') {
        newFile.children = {};
        for (let child in file.children) {
            newFile.children[child] = deepCopyFile(file.children[child]);
        }
    }

    return newFile;
}

// 'cp' command
function cpCommand(flags, args) {
    if (args.length < 2) {
        appendToOutput('cp: missing file operand');
        return;
    }

    let targetName = args[args.length - 1];
    let sourceNames = args.slice(0, args.length - 1);

    // If targetName is not a directory and there are multiple sources, it's an error
    if (!currentDirectory.children[targetName] || currentDirectory.children[targetName].type !== 'directory') {
        if (sourceNames.length > 1) {
            appendToOutput('cp: target must be a directory when copying multiple files');
            return;
        }
    }

    for (let i = 0; i < sourceNames.length; i++) {
        let sourceName = sourceNames[i];
        let targetParent = currentDirectory;
        let targetIsDir = false;

        // Special cases for source directory
        if (sourceName === '..') {
            if (currentDirectory.parent) {
                sourceName = '';
                targetParent = currentDirectory.parent;
            } else {
                appendToOutput('cp: cannot copy parent of root directory');
                return;
            }
        }

        const source = currentDirectory.children[sourceName];
        if (!source) {
            appendToOutput(`cp: cannot stat '${sourceName}': No such file or directory`);
            continue;
        }

        if (source.type === 'directory' && !flags.includes('r')) {
            appendToOutput(`cp: omitting directory '${sourceName}'`);
            continue;
        }

        let newTargetName = targetName;

        // Special cases for target directory
        if (newTargetName === '.') {
            newTargetName = sourceName;
        } else if (newTargetName === '..') {
            if (currentDirectory.parent) {
                targetParent = currentDirectory.parent;
                newTargetName = sourceName;
            } else {
                appendToOutput('cp: cannot copy to parent of root directory');
                continue;
            }
        } else if (targetParent.children[newTargetName] && targetParent.children[newTargetName].type === 'directory') {
            // If the target is a directory, set the targetParent to be that directory
            targetParent = targetParent.children[newTargetName];
            newTargetName = sourceName;
            targetIsDir = true;
        }

        // Check if a file or directory with the same name already exists in the target directory
        if (targetParent.children[newTargetName] && !targetIsDir) {
            appendToOutput(`cp: cannot copy '${sourceName}' to '${newTargetName}': File or directory already exists`);
            continue;
        }

        // Copy the source to a new object
        let newSource = deepCopyFile(source);

        // Update the new source's name only if target isn't a directory
        if (!targetIsDir) {
            newSource.name = newTargetName;
        }

        // Add the new source to the target's children
        targetParent.children[newTargetName] = newSource;

        // Update the parent of the new source
        newSource.parent = targetParent;
    }
}


//  'cat' command
function catCommand(flags, args) {

    for (let i = 0; i < args.length; i++) {

        const file = args[i];

        if (currentDirectory.children && currentDirectory.children[file]) {
            if (currentDirectory.children[file].type === 'file') {
                appendToOutput(currentDirectory.children[file].content);
            } else {
                appendToOutput(`cat: ${file}: Is a directory`);
            }
        } else {
            appendToOutput(`cat: ${file}: No such file or directory`);
        }
    }


}

//  'viewimg' command

function viewimgCommand(flags, args) {
    // first argument is the base64 image name
    const img = args[0];

    // if no name or name has / or name is not a file
    if (!img) {
        appendToOutput('viewimg: no name for image given');
        return;
    } else if (img.includes('/')) {
        appendToOutput(`viewimg: cannot view image '${img}': No such file or directory`);
        return;
    } else if (currentDirectory.children[img] && currentDirectory.children[img].type !== 'file') {
        appendToOutput(`viewimg: cannot view image '${img}': Is a directory`);
        return;
    }

    // if image exists, check it is an image then display it
    if (currentDirectory.children[img]) {
        const imgData = currentDirectory.children[img].content;

        if (!imgData.startsWith('data:image/')) {
            appendToOutput(`viewimg: cannot view '${img}': Not an image file`);
            return;
        }

        const image = document.createElement('img');
        image.src = imgData;
        image.style.maxWidth = '100%';
        image.style.maxHeight = '100%';
        image.style.objectFit = 'contain';
        // image.style.margin = 'auto';
        image.style.display = 'block';
        image.style.border = '1px solid black';
        image.style.boxShadow = '0 0 10px black';
        image.style.borderRadius = '5px';
        image.style.marginBottom = '10px';
        image.style.marginTop = '10px';
        image.style.clear = 'both'; 
        outputElement.appendChild(image);
    }
    // if image does not exist, print message to output window
    else {
        appendToOutput(`viewimg: ${img}: No such file or directory`);
    }

    // Scroll to bottom after waiting for image to load
    setTimeout(() => {
        inputElement.scrollIntoView();
    }, 0);
}


//  'pwd' command
function pwdCommand() {
    let path = '/';
    let currentNode = currentDirectory;

    while (currentNode !== fileSystem.root) {
        path = `/${currentNode.name}${path}`;
        currentNode = currentNode.parent;
    }

    appendToOutput(path);
}

// 'mkdir' command
function mkdirCommand(flags, args) {

    const directory = args[0];

    if (!directory) {
        appendToOutput('mkdir: no name for new directory given');
        return;
    }
    if (currentDirectory.children[directory]) {
        appendToOutput(`mkdir: cannot create directory '${directory}': File exists`);
    } else {
        currentDirectory.children[directory] = {
            name: directory,
            type: 'directory',
            parent: currentDirectory,
            children: {},
        };
    }
}

// 'touch' command
function touchCommand(flags, args) {

    const file = args[0];

    // if no name or name has /
    if (!file) {
        appendToOutput('touch: no name for new file given');
        return;
    } else if (file.includes('/')) {
        appendToOutput(`touch: cannot touch '${file}': No such file or directory`);
        return;
    }

    if (currentDirectory.children[file]) {
        if (currentDirectory.children[file].type === 'file') {
            // If a file already exists with this name, 'touch' updates the modification time
            // For the purpose of this terminal simulation, we do nothing
        } else {
            appendToOutput(`touch: cannot touch '${file}': Is a directory`);
        }
    } else {
        currentDirectory.children[file] = {
            name: file,
            type: 'file',
            content: '',
        };
    }
}

// 'rm' command
function rmCommand(flags, args) {

    const files = args;

    if (files.length === 0) {
        appendToOutput('rm: missing operand');
        return;
    }

    files.forEach(file => {
        const target = currentDirectory.children[file];
        if (!target) {
            appendToOutput(`rm: cannot remove '${file}': No such file or directory`);
        } else if (target.type === 'directory' && !flags.includes('r')) {
            appendToOutput(`rm: cannot remove '${file}': Is a directory`);
        } else {
            delete currentDirectory.children[file];
        }
    });
}

// 'rmdir' command
function rmdirCommand(flags, args) {
    const directory = args[0];

    if (!directory) {
        appendToOutput('rmdir: missing operand');
        return;
    }
    const target = currentDirectory.children[directory];
    if (!target) {
        appendToOutput(`rmdir: failed to remove '${directory}': No such file or directory`);
    } else if (target.type === 'file') {
        appendToOutput(`rmdir: failed to remove '${directory}': Not a directory`);
    } else if (Object.keys(target.children).length > 0) {
        appendToOutput(`rmdir: failed to remove '${directory}': Directory not empty`);
    } else {
        delete currentDirectory.children[directory];
    }
}

// 'edit' command
function editCommand(flags, args) {
    const file = args[0];
    if (currentDirectory.children[file] && currentDirectory.children[file].type === 'file') {
        editMode = true;
        currentFile = currentDirectory.children[file];
        enableEditor(file);
        appendToOutput(`Edit mode opened for ${file}`);
    }
    else if (currentDirectory.children[file] && currentDirectory.children[file].type === 'directory') {
        appendToOutput(`edit: ${file}: Is a directory`);
    }
    else {
        appendToOutput(`edit: ${file}: No such file or directory`);
    }
}

// load pyodide instance function(used once when python command is called)
async function loadPyodideInstance() {
    pyodideInstance = await loadPyodide({});
    // install libraries
    await pyodideInstance.loadPackage("micropip");
    const micropip = pyodideInstance.pyimport("micropip");

    let packages = ['matplotlib', 'numpy', 'pandas', 'scipy', 'scikit-learn', 'seaborn', 'statsmodels', 'regex'];

    // Store the old console.log function
    const oldLog = console.log;

    // Override the console.log function
    console.log = function (message) {
        oldLog.apply(console, arguments);
        appendToOutput(message);
    };

    // Start the installation of all packages and wait for all to complete
    try {
        await Promise.all(packages.map(pkg => micropip.install(pkg)));
    } catch (e) {   
        throw e;
    }

    // Restore the old console.log function
    console.log = oldLog;

}

// 'python' command
async function pythonCommand(flags, args) {
    runningProgram = true;
    const file = args[0];
    inputElement.value = 'Running Python...';

    if (currentDirectory.children[file] && currentDirectory.children[file].type === 'file') {
        let main = async () => {
            let code = currentDirectory.children[file].content;
            code = code.replace(/plt\.savefig\(.+\)/g, 'plt.show()');

            // get all files in current directory
            function toBase64(str) {
                return btoa(unescape(encodeURIComponent(str)));
            }
            let filesInFolder = {};
            for (let fileName in currentDirectory.children) {
                if (currentDirectory.children[fileName].type === 'file') {
                    filesInFolder[fileName] = toBase64(currentDirectory.children[fileName].content);
                }
            }
            // Convert the filesInFolder object into a JSON string
            let filesInFolderJson = JSON.stringify(filesInFolder);

            let preExecutionCode = `
                # remove all user variables and functions
                for var in list(globals()):
                    if var[0] != '_':
                        del globals()[var]

                # imports
                import matplotlib.pyplot as plt
                import io
                import builtins
                import base64
                import sys
                import json
                import inspect
                import os

                plt.close('all')
                plt.clf()
                plt.cla()
                plt.rcdefaults()

                sys.stdout = io.StringIO()
                sys.stderr = io.StringIO()

                sys.argv = ['${file}']

                # Parse the JSON string to convert it into a Python dictionary
                filesInFolder = json.loads('${filesInFolderJson}')

                def new_show_func(*args, **kwargs):
                    buf = io.BytesIO()
                    plt.savefig(buf, format='png')
                    buf.seek(0)
                    image_base64 = base64.b64encode(buf.read()).decode('utf-8')
                    image_base64 = 'data:image/png;base64,' + image_base64
                    buf.close()
                    plt.close()
                    print(image_base64)
                    return image_base64

                plt.show = new_show_func

                class JSFile:
                    def __init__(self, filename, content, mode='r'):
                        self.filename = filename
                        self.newline = chr(10)  # ASCII value for 'slash n'
                        self.mode = mode
                        self.content = content
                        self.lines = self.content.split(self.newline)
                        self.position = 0  # To keep track of current position in the file
                        self.buffer = ''  # Buffer to hold the content written in a single session

                    def read(self, size=-1):
                        result = self.content[self.position:]  # Return content from current position to end
                        self.position = len(self.content)  # Move position to end of file
                        return result

                    def readline(self, size=-1):
                        # Check if there are still lines to read
                        if self.position < len(self.lines):
                            result = self.lines[self.position] + self.newline  # Add 'slash n' at the end of each line
                            self.position += 1  # Increment position to next line
                            return result
                        else:
                            return ''

                    def readlines(self, sizehint=-1):
                        result = self.lines[self.position:]
                        self.position = len(self.lines)  # Move position to end of file
                        return [line + self.newline for line in result]

                    def write(self, text):
                        if self.mode == 'r':
                            raise IOError('File not open for writing')
                        elif self.mode == 'a' or self.mode == 'w':
                            self.buffer += text

                    def seek(self, pos, whence=0):
                        if whence == 0:
                            self.position = pos
                        elif whence == 1:
                            self.position += pos
                        elif whence == 2:
                            self.position = len(self.content) + pos  # pos is usually negative in this case

                    def tell(self):
                        return self.position

                    def close(self):
                        if self.mode == 'a':
                            self.content += self.buffer
                        elif self.mode == 'w':
                            self.content = self.buffer
                        filesInFolder[self.filename] = base64.b64encode(self.content.encode()).decode('utf-8')
                        self.buffer = ''  # Clear the buffer

                    def __enter__(self):
                        return self

                    def __exit__(self, exc_type, exc_val, exc_tb):
                        self.close()



                original_open = builtins.open  # save the original open function
                
                def new_open_func(filename, mode='r', buffering=-1, encoding=None, errors=None, newline=None, closefd=True, opener=None):
                    # Check if the call is made from a library in site-packages
                    is_system_lib = 'site-packages' in os.path.dirname(inspect.stack()[1].filename)
                
                    if filename in filesInFolder:
                        file_content = filesInFolder[filename]
                        file_content = base64.b64decode(file_content).decode('utf-8')  # Decode the base64 string
                        return JSFile(filename, file_content, mode)
                    else:
                        # if 'matplotlib' in filename, return original_open directly
                        if 'matplotlib' in filename:
                            return original_open(filename, mode, buffering, encoding, errors, newline, closefd, opener)
                        if 'w' in mode or 'a' in mode:
                            return JSFile(filename, '', mode)
                        else:
                            if 'r' in mode and not is_system_lib: 
                                raise FileNotFoundError('No such file or directory: ' + filename)
                            # Check if the file is in the system's storage
                            try:
                                return original_open(filename, mode, buffering, encoding, errors, newline, closefd, opener)  # Use the original open function
                            except FileNotFoundError:
                                raise FileNotFoundError('No such file or directory: ' + filename)
                
                builtins.open = new_open_func
            `;

            pyodideInstance.runPython(preExecutionCode);

            if (args.length > 1) {
                for (let i = 1; i < args.length; i++) {
                    pyodideInstance.runPython(`
                        sys.argv.append('${args[i]}')
                    `);
                }
            }

            try {
                await pyodideInstance.runPythonAsync(code);

                // Convert the updated filesInFolder dictionary back to JSON
                let updatedFilesInFolderJson = pyodideInstance.runPython('json.dumps(filesInFolder)');
                // Parse the JSON string back into a JavaScript object
                let updatedFilesInFolder = JSON.parse(updatedFilesInFolderJson);
                // Update the contents of the files in currentDirectory
                for (let fileName in updatedFilesInFolder) {
                    if (currentDirectory.children[fileName] && currentDirectory.children[fileName].type === 'file') {
                        currentDirectory.children[fileName].content = atob(updatedFilesInFolder[fileName]);
                    } else {
                        // The file was created in Python and doesn't exist in currentDirectory.children
                        // So, we should create a new entry for it
                        currentDirectory.children[fileName] = {
                            name: fileName,
                            type: 'file',
                            content: atob(updatedFilesInFolder[fileName])
                        };
                    }
                }



                let stdout = pyodideInstance.runPython('sys.stdout.getvalue()');
                let stderr = pyodideInstance.runPython('sys.stderr.getvalue()');

                stdout = stdout.trim();
                stderr = stderr.trim();

                // Check the stdout for image base64 strings and save each one
                let base64Matches = stdout.match(/data:image\/png;base64,[A-Za-z0-9+/]+=*/g);
                if (base64Matches) {
                    for (let i = 0; i < base64Matches.length; i++) {
                        let outputFileName = `output${i + 1}.png`;
                        currentDirectory.children[outputFileName] = {
                            name: outputFileName,
                            type: 'file',
                            content: base64Matches[i],
                        };
                        viewimgCommand([], [outputFileName]);
                        stdout = stdout.replace(base64Matches[i], `Output image saved to '${outputFileName}'.`);
                    }
                }
                appendToOutput(stdout);
            } catch (error) {
                let errorMessage = error.message;
                let errorStart = errorMessage.indexOf('File "<exec>", line');
                if (errorStart !== -1) {
                    errorMessage = errorMessage.substring(errorStart);
                    errorMessage = errorMessage.replace(/<exec>/g, file);
                    errorMessage = errorMessage.substring(0, errorMessage.length - 1);
                }
                appendToOutput(`Python error: ${errorMessage}`);
                runningProgram = false;
            }
        };
        await main();
    }
    else if (currentDirectory.children[file] && currentDirectory.children[file].type === 'directory') {
        appendToOutput(`python: ${file}: Is a directory`);
    }
    else {
        appendToOutput(`python: ${file}: No such file or directory`);
    }
    runningProgram = false;
    inputElement.value = '';
}


function wasmCommand(flags, args) {
    // first argument is the wasm file name
    const wasm = args[0];

    // if no name or name has / or name is not a file
    if (!wasm) {
        appendToOutput('wasm: no name for wasm file given');
        return;
    } else if (wasm.includes('/')) {
        appendToOutput(`wasm: cannot run wasm file '${wasm}': No such file or directory`);
        return;
    } else if (currentDirectory.children[wasm] && currentDirectory.children[wasm].type !== 'file') {
        appendToOutput(`wasm: cannot run wasm file '${wasm}': Is a directory`);
        return;
    }

    // wasm files are already compiled and have no header, so don't check for data:application/wasm;base64,
    if (currentDirectory.children[wasm]) {
        const wasmString = currentDirectory.children[wasm].content;
        const wasmBytes = new Uint8Array(wasmString.length);
        for (let i = 0; i < wasmString.length; i++) {
            wasmBytes[i] = wasmString.charCodeAt(i);
        }

        WebAssembly.instantiate(wasmBytes, { env }).then(result => {
            const exports = result.instance.exports;
            const main = exports.main;
            const output = main();
            appendToOutput(output);
        }
        ).catch(error => {
            appendToOutput(`wasm: ${wasm}: ${error}`);
        });
    } else {
        appendToOutput(`wasm: ${wasm}: No such file or directory`);
    }
}


// 'download' command
function downloadCommand(flags, args) {
    // Loop over all arguments
    for (const file of args) {
        if (currentDirectory.children[file] && currentDirectory.children[file].type === 'file') {
            let content = currentDirectory.children[file].content;
            
            // If the content doesn't start with 'data:', treat it as raw text and create a data URL
            if (!content.startsWith('data:')) {
                content = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
            }

            const element = document.createElement('a');
            element.setAttribute('href', content);
            element.setAttribute('download', file);
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
        }
        else if (currentDirectory.children[file] && currentDirectory.children[file].type === 'directory') {
            appendToOutput(`download: ${file}: Is a directory`);
        }
        else {
            appendToOutput(`download: ${file}: No such file or directory`);
        }
    }
}

// 'df' command
function dfCommand(flags, args) {
    // calculate file system size
    let totalSize = 0;
    function calculateSize(directory) {
        if (directory.children) {
            Object.values(directory.children).forEach(child => {
                if (child.type === 'directory') {
                    calculateSize(child);
                } else {
                    totalSize += child.content.length;
                }
            });
        }
    }
    function makeSizeHumanReadable(size) {
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        let index = 0;
        while (size >= 1024) {
            size /= 1024;
            index++;
        }
        return `${size.toFixed(2)} ${sizes[index]}`;
    }
    calculateSize(fileSystem.root);
    appendToOutput(`Filesystem size: ${makeSizeHumanReadable(totalSize)} / ~5.00 MB`);
    if (totalSize > 5242880) {
        appendToOutput('Warning: Filesystem size exceeds 5 MB, issues may occur');
    }
}

// 'clear' command
function clearCommand() {
    outputElement.innerHTML = '';
}

// 'alias' command
function aliasCommand(flags, args) {
    if (args.length === 0) {
        // Print all aliases
        for (let alias in aliases) {
            appendToOutput(`alias ${alias}='${aliases[alias]}'`);
        }
    } else if (args.length === 1) {
        // Print the alias if it exists
        if (aliases[args[0]]) {
            appendToOutput(`alias ${args[0]}='${aliases[args[0]]}'`);
        } else {
            appendToOutput(`alias: ${args[0]}: not found`);
        }
    } else if (args.length === 2) {
        // Set the alias
        aliases[args[0]] = args[1];
    }
}

// 'unalias' command
function unaliasCommand(flags, args) {
    if (args.length === 0) {
        appendToOutput('unalias: not enough arguments');
    } else {
        args.forEach(alias => {
            if (aliases[alias]) {
                delete aliases[alias];
            } else {
                appendToOutput(`unalias: ${alias}: not found`);
            }
        });
    }
}

function saveCommand(flags, args) {
    localStorage.setItem('fileSystem', JSON.stringify(cloneFileSystemWithoutParents(fileSystem)));
    localStorage.setItem('username', username);
    localStorage.setItem('aliases', JSON.stringify(aliases));
    localStorage.setItem('autosave', JSON.stringify(autosave));
}

// Append text to the terminal output area
function appendToOutput(text, isHTML = false) {
    if (isHTML) {
        outputElement.innerHTML += text + '\n';
    } else {
        let textNode = document.createTextNode(text + '\n');
        outputElement.appendChild(textNode);
    }
    // Scroll to bottom
    inputElement.scrollIntoView();
}

// Store command history
let commandHistory = [];
let commandHistoryIndex = -1;
// Handle key press events
document.addEventListener('keydown', event => {
    if (!editMode && !runningProgram) {
        handleNonEditModeKey(event);
    } else if (editMode) {
        handleEditModeKey(event);
    }
});

function handleNonEditModeKey(event) {
    // Get key
    const { key } = event;
    const inputValue = inputElement.value;

    if (key === 'Enter') {
        // Execute the command when the Enter key is pressed
        event.preventDefault();
        commandHistory.push(inputValue);
        commandHistoryIndex = commandHistory.length;
        executeCommand();
        if(autosave) {
            saveCommand();
        }
    } else if (key === 'ArrowUp') {
        // Navigate through the command history in the backward direction
        event.preventDefault();
        inputElement.scrollIntoView();
        handleCommandHistoryNavigation(-1);
    } else if (key === 'ArrowDown') {
        // Navigate through the command history in the forward direction
        event.preventDefault();
        inputElement.scrollIntoView();
        handleCommandHistoryNavigation(1);
    } else if (key === 'Tab') {
        // Autocomplete filenames based on the inputValue
        event.preventDefault();
        handleTabAutocomplete(inputValue);
    }
    updatePrompt();
}

function handleCommandHistoryNavigation(direction) {
    // Calculate the new index based on the given direction
    const newIndex = commandHistoryIndex + direction;

    // Update the commandHistoryIndex and inputElement value based on the new index
    if (newIndex >= 0 && newIndex < commandHistory.length) {
        commandHistoryIndex = newIndex;
        inputElement.value = commandHistory[commandHistoryIndex];
    } else if (newIndex === commandHistory.length) {
        commandHistoryIndex = newIndex;
        inputElement.value = '';
    }
}

function handleTabAutocomplete(inputValue) {
    // Get the current cursor position
    const cursorPosition = inputElement.selectionStart;

    // Split the string into two parts based on the cursor position
    const strBeforeCursor = inputValue.substring(0, cursorPosition);
    const strAfterCursor = inputValue.substring(cursorPosition);

    // Split the part before the cursor into words
    const wordsBeforeCursor = strBeforeCursor.split(' ');

    // Get the current word that needs to be autocompleted
    const currentWord = wordsBeforeCursor.pop();

    // Filter the filenames in the current directory to find matching files
    const matchingFiles = Object.keys(currentDirectory.children).filter(filename =>
        filename.startsWith(currentWord) && filename !== currentWord
    );

    // Autocomplete based on the number of matching files
    if (matchingFiles.length === 1) {
        // If there is only one matching file, complete the input with it
        wordsBeforeCursor.push(matchingFiles[0]);
    } else if (matchingFiles.length > 1) {
        // If there are multiple matching files, find the common characters to autofill
        let autofill = '';
        let i = 0;

        while (true) {
            const char = matchingFiles[0][i];
            // Check if every filename has the same character at the current position
            if (matchingFiles.every(filename => filename[i] === char)) {
                autofill += char;
                i++;
            } else {
                break;
            }
        }

        // Complete the input with the common characters found
        wordsBeforeCursor.push(autofill);
    } else {
        // If there are no matching files, push the currentWord back into wordsBeforeCursor
        wordsBeforeCursor.push(currentWord);
    }

    // Combine the words before the cursor, the completed word, and the string after the cursor
    inputElement.value = `${wordsBeforeCursor.join(' ')}${strAfterCursor}`;

    // Move the cursor to the end of the completed word
    const newCursorPosition = wordsBeforeCursor.join(' ').length;
    inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
}

function handleEditModeKey(event) {
    const { key } = event;
    const { value: editorValue, selectionStart, selectionEnd } = editorTextArea;

    if (key === 'Escape') {
        // If the Escape key is pressed, exit edit mode and display a cancellation message
        event.preventDefault();
        exitEditMode();
        appendToOutput('Editor closed.');
    } else if (event.ctrlKey && key === 's') {
        // If Ctrl + S is pressed, save the file and display a save message
        event.preventDefault();
        saveFile(editorValue);
        appendToOutput('File saved.');
    } else if (key === 'Tab') {
        // If the Tab key is pressed, insert 4 spaces in the editor
        event.preventDefault();
        insertSpacesInEditor(4, selectionStart, selectionEnd);
    }
}

// Show editor
function enableEditor(file) {
    // If file exists, show file data in editor
    if (currentDirectory.children[file]) {
        editorContainer.style.display = 'block';
        editorTextArea.value = currentDirectory.children[file].content;
        editorTextArea.style.whiteSpace = 'pre-wrap';
        editorFileName.textContent = file;

        // Create span elements for the clickable commands
        const saveSpan = document.createElement('span');
        saveSpan.textContent = 'Ctrl + S';
        saveSpan.style.cursor = 'pointer';
        saveSpan.style.textDecoration = 'underline';
        saveSpan.style.display = 'inline';
        saveSpan.onclick = () => saveFile(editorTextArea.value);

        const escapeSpan = document.createElement('span');
        escapeSpan.textContent = 'Esc';
        escapeSpan.style.cursor = 'pointer';
        escapeSpan.style.textDecoration = 'underline';
        escapeSpan.style.display = 'inline';
        escapeSpan.onclick = () => {
            exitEditMode();
            appendToOutput('Editor closed.');
        };

        // Create a span for the save message
        const saveMessage = document.createElement('span');
        saveMessage.id = 'save-message';
        saveMessage.style.display = 'none';

        // Create a span for the editing message
        const editingMessage = document.createElement('span');
        editingMessage.id = 'editing-message';
        editingMessage.appendChild(document.createTextNode(`Editing ${file}. Press `));
        editingMessage.appendChild(saveSpan);
        editingMessage.appendChild(document.createTextNode(' to save and '));
        editingMessage.appendChild(escapeSpan);
        editingMessage.appendChild(document.createTextNode(' to exit.'));

        // Set the editorHeader text and append the messages
        editorHeader.innerHTML = '';  // Clear previous content
        editorHeader.appendChild(editingMessage);
        editorHeader.appendChild(saveMessage);

        updateLineNumbers();
        editorTextArea.focus();
    }
    // If file does not exist, print message to output window, don't open editor.
    else {
        appendToOutput(`enableEditor called on ${file}! This should not happen!`);
    }
}

// Save file
function saveFile(content) {
    currentFile.content = content.trim();

    const saveMessage = document.getElementById('save-message');
    const editingMessage = document.getElementById('editing-message');
    
    // Show the save message and hide the editing message
    saveMessage.style.display = 'inline';
    editingMessage.style.display = 'none';
    saveMessage.textContent = 'File saved!';
    
    setTimeout(() => {
        // Hide the save message and show the editing message
        saveMessage.style.display = 'none';
        editingMessage.style.display = 'inline';
        saveMessage.textContent = '';
    }, 2000);
}



// Hide editor
function disableEditor() {
    editorContainer.style.display = 'none';
    editorTextArea.value = '';
    editorFileName.textContent = '';
    editorHeader.textContent = '';
    inputElement.focus();
}

function exitEditMode() {
    editMode = false;
    currentFile = null;
    if(autosave) {
        saveCommand();
    }
    disableEditor();
}

function updateLineNumbers() {
    // Puts line numbers in editor
    let lineCount = editorTextArea.value.split('\n').length;
    linenumbers.innerHTML = '';
    for (let i = 1; i <= lineCount; i++) {
        linenumbers.innerHTML += i + '<br>';
    }
}

function insertSpacesInEditor(spacesCount, start, end) {
    const spaces = ' '.repeat(spacesCount);
    editorTextArea.value =
        editorTextArea.value.substring(0, start) +
        spaces +
        editorTextArea.value.substring(end);
    editorTextArea.selectionStart = editorTextArea.selectionEnd = start + spacesCount;
}

// function saveFile(content) {
//     currentFile.content = content.trim();

//     const savedMessage = editorHeader.textContent;
//     editorHeader.textContent = 'File saved!';
//     setTimeout(() => {
//         editorHeader.textContent = savedMessage;
//     }, 2000);
// }


// Handle drag and drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.addEventListener(eventName, preventDefaults, false);
});
// save to localStorage on drop after 0.3 seconds
document.addEventListener('drop', () => {
    setTimeout(() => {
        if(autosave) {
            saveCommand();
        }
    }, 300);
}, false);
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}
document.addEventListener('drop', handleDrop, false);
function handleDrop(e) {
    if (!editMode) {
        let files = e.dataTransfer.files;
        for (let i = 0; i < files.length; i++) {
            readFile(files[i]);
        }
    }
}
function readFile(file) {
    var reader = new FileReader();
    reader.onload = function (event) {
        let fileName = file.name.replace(/[^a-zA-Z0-9_\-\.]/g, '');
        if(fileName === '') {
            // name file 'untitled#' if no name, where # is the number of untitled files
            let untitledCount = 0;
            for (let file in currentDirectory.children) {
                if (file.includes('untitled')) {
                    untitledCount++;
                }
            }
            fileName = `untitled${untitledCount}`;
        }

        let content = event.target.result;

        currentDirectory.children[fileName] = {
            name: fileName,
            type: 'file',
            content: content,
        };
    };

    // If it's an image, read it as a base64 data URL
    if(file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
    } else {
        reader.readAsText(file);
    }

    appendToOutput(`File '${file.name}' uploaded. ${file.size} bytes used.`);
}
// End drag and drop



// Handle input blur event
inputElement.addEventListener('blur', () => {
    if (!editMode) {
        // Refocus the input element
        inputElement.focus();
    }
});

// handle editor blur event
editorTextArea.addEventListener('blur', () => {
    if (editMode) {
        // Refocus the input element
        editorTextArea.focus();
    }
});

// Add event listeners for editorTextArea change and scroll
editorTextArea.addEventListener('input', updateLineNumbers);
editorTextArea.addEventListener('scroll', function () {
    linenumbers.scrollTop = editorTextArea.scrollTop;
});

// Focus the input element on page load
updatePrompt();
inputElement.focus();