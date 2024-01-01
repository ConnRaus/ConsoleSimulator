# ConsoleSimulator

ConsoleSimulator is a web-based terminal "simulator" that allows you to run Python scripts and store files locally through the web browser. It emulates a Linux-like environment, making it a fun tool for basic tasks and learning.

You can access the online running example at [consolesimulator.netlify.app](https://consolesimulator.netlify.app).

## Usage

It's a simple HTML/CSS/JS webpage, to run it locally simply open index.html in a web browser.

### Commands

- `help`: Displays the help menu.
- `ls`: Lists files and directories.
- `cd`: Change directory.
- `mv`: Move file or directory.
- `cat`: Print file contents.
- `echo`: Print arguments.
- `viewimg`: Displays an image.
- `pwd`: Print the working directory.
- `mkdir`: Create a directory.
- `touch`: Create a file.
- `rm`: Remove a file.
- `rmdir`: Remove a directory.
- `edit`: Open a file editor.
- `python`: Run a Python file.
- `download`: Download a file.
- `df`: Display filesystem usage.
- `clear`: Clear the terminal.
- `alias`: Create an alias for a command.
- `unalias`: Remove an alias for a command.
- `setuser`: Change username.
- `save`: Manual save.
- `autosave`: Toggle autosaving on/off.

### Default Aliases

A few default aliases are set up for ease of use, which can be changed as needed. 

- `l`: Alias for `ls`.
- `ll`: Alias for `ls -l`.
- `la`: Alias for `ls -a`.
- `..`: Alias for `cd ..`.
- `vi`, `vim`, `nano`, `code`: Aliases for `edit`.
- `view` and `show`: Aliases for `viewimg`.
- `setname`, `setusername`, `changeuser`, `changeusername`, `changename`: Aliases for `setuser`.
- `dl`: Alias for `download`.]

### Limitations

- Absolute and long relative file paths are currently not supported; you can only work within immediate folders.
- Piping functionality is not available in the current version.

## About Python

ConsoleSimulator uses a specially set-up version of Pyodide to run Python from "files" in your browser. You can pass arguments, including other files, to Python programs. If your Python script generates images, they will be saved as `output1.png`, `output2.png`, and so on, and can be viewed using `viewimg` in the terminal window.

### Python Notes

- Python files only print after execution, so ensure your code is working to prevent freezing the webpage.
- Importing unavailable libraries will freeze the application.
- Due to Pyodide's input handler, input works but lacks a prompt message, and previous print statements aren't visible until the program ends. 

### Supported Libraries

Currently supported libraries include:

- matplotlib
- numpy
- pandas
- scipy
- scikit-learn
- seaborn
- statsmodels
- regex
- pillow (partially)

Basic libraries like sys and os can also be used, though some system functions may behave differently due to Pyodide's implementation.


