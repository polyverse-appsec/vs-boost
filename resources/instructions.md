Polyverse Boost Visual Studio Extension
=======================================

Welcome to the Polyverse Boost Visual Studio extension! Boost is a powerful VS Code "notebook" extension designed to help you automatically convert your legacy code into a new programming language using AI.

Getting Started
---------------

1.  **Load a legacy source file** using the `Boost: Load File` command. This will parse the file into distinct functions and place them into a `boost-notebook` file. Each function becomes a cell.

2.  **Select the output language** for the conversion with the `Boost: Select Output Language` command.

3.  **Perform the boost analysis** by clicking the "run" triangular button on the top left of each cell. The analysis may take up to a minute for the AI to process the code.

4.  **Review the generated results**. After the analysis is complete, a new cell containing an English description of the code and the converted code in your selected language (e.g. Python) will be generated.

Main Features
-------------

-   Automatically converts legacy code into a new programming language using AI.
-   Provides an English description of the code to help understand its functionality.
-   Each function is placed in a separate cell, allowing for easy organization and navigation.
-   Select from a variety of output languages for code conversion.
-   Save time and effort by automating the code conversion process.

Commands
--------

-   `Boost: Load File`: Load a legacy source file to be converted.
-   `Boost: Select Output Language`: Choose the output language for the code conversion.

Extension Settings
------------------

Polyverse Boost extension settings can be configured in the VS Code settings. Available settings include:

-   `polyverse.boost.defaultOutputLanguage`: Set the default output language for code conversion.

Troubleshooting
---------------

If you encounter any issues or have questions about the Polyverse Boost extension, please refer to our [GitHub repository](https://github.com/polyverse/boost-extension) or [documentation](https://docs.polyverse.io/boost-extension) for more information and support.

Happy coding!
