# Polyverse Boost Visual Studio Extension

Transform, secure, and enhance your code with AI-driven analysis, all in one powerful extension - *Polyverse Boost*.

## Features

* **Automated Code Conversion**: Convert legacy code to new programming languages using AI.
* **Security Vulnerability Analysis**: Detect security vulnerabilities in your code.
* **Test Case Generation**: Automatically create test cases for your code.
* **Code Description**: Get an English description of your code to better understand its functionality.
* **Easy Organization**: Functions are placed in separate cells for better navigation.

## Getting Started

1. **Load a legacy source file**: Use the `Boost: Load File` command to parse the file into distinct functions in a `boost-notebook` file.
2. **Select a command kernel**: Use the `Boost: Select Kernel` command to choose from available kernels: "Analyze code for security vulnerabilities", "Convert from legacy code", or "Generate test cases for code".
3. **Select the output language**: Choose your desired output language with the `Boost: Select Output Language` command (only required for "convert from legacy code" kernel).
4. **Perform the boost analysis**: Click the "run" button on each cell to process the code. Use "run-all" to execute features across all cells.
5. **Review the generated results**: View an English description, the converted code, or the generated test cases, depending on the selected command kernel.

## Commands

* `Boost: Load File`: Load a legacy source file for conversion.
* `Boost: Select Kernel`: Choose a command kernel for a specific task.
* `Boost: Select Output Language`: Select the output language for code conversion (only required for "convert from legacy code" kernel).

## Extension Settings

Configure Polyverse Boost extension settings in the Visual Studio settings, under Extensions > Polyverse Boost:

* `polyverse-boost-notebook.defaultDir`: Set the default directory for `@.boost-notebook` files.
* `polyverse-boost-notebook.outputLanguage`: Set the default output language for code conversion.
* `polyverse-boost-notebook.testFramework`: Set the default test framework for generating tests (e.g., pytest).

## Troubleshooting

If you encounter any issues or have questions, please refer to our [documentation](https://polyverse.com) for more information and support.

*Happy coding!*

## About Polyverse

Founded in 2015 by Alex Gounares, former CTO of AOL and Microsoft Online, and Bill Gate's technology advisor, Polyverse Corporation has been delivering state-of-the-art cybersecurity tools to the Fortune 500 and the US Government. Our mission is to empower developers with cutting-edge solutions to keep their code safe from sophisticated attacks.

