# Polyverse Boost Visual Studio Extension

Transform, secure, and enhance your code with AI-driven analysis, all in one powerful extension - *Polyverse Boost*.

## Features

* **Automated Code Conversion**: Convert legacy code to new programming languages using AI.
* **Security Vulnerability Analysis**: Detect security vulnerabilities in your code.
* **Test Case Generation**: Automatically create test cases for your code.
* **Code Description**: Get an English description of your code to better understand its functionality.
* **Easy Organization**: Functions are placed in separate cells for better navigation.

## Quick Start

### Prequesites
1. **Setup your Boost License** by contacting [Polyverse](https://polyverse.com/pages/boost-visual-studio) to get a free trial license key, or purchase a license key directly from the [Polyverse Store](https://polyverse.com/pages/boost-buy-visual-studio).
2. **Setup a [GitHub.com[(https://GitHub.com) account** - to link your Polyverse license to your email address.

### Installation
1. **Install the Boost Modernization extension** from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=Polyverse.polyverse-boost). NOTE: A restart of Visual Studio Code may be required.
2. **Create your first Boost Notebook** - using the Command dropdown and selecting `Create Polyverse Boost Notebook` (Ctrl+Shift+P or Cmd+Shift+P on Mac) 
3. **Load your Source Code**: Use the `Boost: Load File` command to parse your source code into Boost Notebook cells so you can review and edit.
4. **Select Your Modernization Process**: Use the `Boost: Select Kernel` command to choose from available AI-enhanced processing:
  * **Analyze Code for Bugs, Defects and Security Vulnerabilities** select `Analyze code for security vulnerabilities`
  * **Modernize Code to a newer language** select `Convert Legacy Code to New Code`
  * **Generate Test Cases** select `Generate Test Cases for code`
  * **Generation Code Documentation** select `Explain code`

5. _NOTE: For Code Conversion only_ **Choose Your New Programming Language**: select `Boost: Select Output Language` and choose from supported languages, including Python, Java, C\#, C++, TypeScript, and JavaScript.
6. **Run the AI-enabled Analysis and Processing**: For full file analysis across all Cells, click the Boost button `run-all`. Or select a single Boost Notebook cell and click the Boost button `run`.
7. **Review the Results**: Each Boost Notebook cell will contain the results of the AI-enhanced processing.
  * **For Defect and Security Analysis**, you can edit the code in each Cell and re-run the analysis to see the results.
  * **For Code Conversion**, you can review the new code in each Cell for integration into your new modernized project.
  * **For Documentation**, you can read the documentation to better understand legacy code, review for architectural or potential redesign, and to better understand how the original code actually worked.
  * **For Test Generation**, you can review the test cases and integrate them into your automated test harness or CI/CD/CT system.

## Command Reference
  * **Analyze Code for Bugs, Defects and Security Vulnerabilities** select `Analyze code for security vulnerabilities`
  * **Modernize Code to a newer language** select `Convert Legacy Code to New Code`
  * **Generate Test Cases** select `Generate Test Cases for code`
  * **Generation Code Documentation** select `Explain code`

* `Boost Create Polyverse Boost Notebook`: Create a new Boost Notebook workspace and Cells for your analysis, review, and editing.
* `Boost: Load File`: Load existing source files for conversion.
* `Boost: Select Kernel`: Choose an AI-enabled analysis and modernizing task, such as code conversion, documentation generation,
     test generation, or security vulnerability analysis.
* `Boost: Select Output Language`: Choose a new programming language for modernizing your existing code NOTE: Only required for "Convert Legacy Code to New Code".

## Extension Settings

Configure Polyverse Boost extension settings in the Visual Studio settings, under Extensions > Polyverse Boost:

* `polyverse-boost-notebook.defaultDir`: Set the default directory for `@.boost-notebook` files.
* `polyverse-boost-notebook.outputLanguage`: Set the default output language for code conversion.
* `polyverse-boost-notebook.testFramework`: Set the default test framework for generating tests (e.g., pytest).

## Troubleshooting

### FAQ: Common Questions and Issues
 * Q: I'm getting an error message when I try to run the Boost Notebook. What's wrong?
 * A: Make sure you have a valid Boost license key. You can get a free trial license key by contacting [Polyverse](https://polyverse.com/pages/boost-visual-studio) or purchase a license key directly from the [Polyverse Store](https://polyverse.com/pages/boost-buy-visual-studio).

 * Q: What languages are supported for code conversion?
 * A: Most modern programming languages are supported, including: Python, Ruby, Golang, Swift, Visual Basic, Java, C\#, C++, TypeScript, and JavaScript.

 * Q: I don't have a [GitHub.com](GitHub.com) account. Can I still use the Boost extension?
 * A: You must your email address registered with a valid [GitHub.com](GitHub.com) account. You do not need to store any source code on GitHub.com, but you do need to have a valid verified email so we can confirm your license key at runtime.

 * Q: My source code is proprietary to me or my company, that I do not want to store on other servers. Can I still use the Boost extension?
 * A: Yes. The Boost extension does not require you to store any source code on GitHub.com. Also, Polyverse does NOT store or retain any of your source code during analysis. Your source code is only stored on your local system running Visual Studio Code.

 * Q: Will the converted code automatically build and run?
 * A: No. The converted code is provided as a starting point for you to review and integrate into your project. You will need to review the converted code, make any necessary changes to ensure it builds and runs correctly, and integrate it into your build or CI/CD system.

 * Q: The generated documentation is in Notebook cells. How do I export to a single file or PDF?
 * A: You can use the `File > Export As...` menu to export the Notebook as a single HTML file, or as a PDF.

 * Q: My source project is very large? How much source code can the Boost process?
 * A: The Boost extension can process large source code files. It is optimized specifically to break your source file
        into individual function Cells for analysis, review, and editing. This allows each function to be independently
        analyzed in real-time. As each Cell and function analysis is completed, you can review specific Cells.

 * Q: I ran analysis and processing on a source file, but some Cells did not complete processing. What's wrong?
 * A: A analysis timeout may have occurred for some functions or Cells. You can re-run the analysis on the Cells that did not complete processing, without re-running the full file analysis.

 * Q: I have another issue that was not addressed here. How can I get Support?
 * A: If you encounter any other issues or have questions, please refer to the [Polyverse Boost](https://polyverse.com/pages/boost-visual-studio) website for more information and support options.

*Happy coding!*

## About Polyverse

Founded in 2015 by Alex Gounares, former CTO of AOL and Microsoft Online, and Bill Gates' technology advisor, Polyverse Corporation has been delivering state-of-the-art cybersecurity tools to the Fortune 500 and the US Government. Our mission is to empower developers with cutting-edge solutions to keep their code safe from sophisticated attacks.

