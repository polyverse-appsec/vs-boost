Polyverse Boost Automatic Application Modernization
======================

# Release Notes
## Version 0.9.4: April 24, 2023

### New Features
- N/A

### Enhancements
- Improved error messages on some network timeouts

### Bug Fixes
- Enable support for processing Perl Module files (*.pm, *.pod)

## Version 0.9.3: April 19, 2023

### New Features
- Added support for evaluating source for best practices, coding guidelines, and recommendations

### Enhancements
- Errors during Boost processing now explicitly show the Kernel used in the message

### Bug Fixes

## Version 0.9.2: April 17, 2023

### New Features
- Added support for reviewing code for Data, Privacy and Personal Info Compliance issues
- Added support for right-clicking on a file in the Explorer and selecting "Boost Analysis from File"
- Added support for running analysis against current active window/source file by using "Boost Analysis from File" command
- Added support for C/C++ Header file processing (e.g. .h, .hpp)
- Added support for displaying Analysis Problems in the Problems panel, including link to the source file if available
- Added support for Output panel to display Boost logging - named "Polyverse Boost"

### Enhancements
- Improved user message for mismatch between email used for GitHub account and Polyverse license.
- User-added Cells with code can now be submitted for all Boost kernels.
- Improved serialization of Notebooks to include metadata, such as output language and test framework
- Improved error reporting to print to Output panel, and only display one Error window when "Run All" is executed
- Improved Extension startup availability by activating when any Boost Notebook is opened or loaded on startup
- Improved error messages for intermittent network issues to Polyverse servers

### Bug Fixes
- Fixed handling of nested brackets/braces in Python code
- Do not create whitespace only Cells

## Version 0.9.1: April 10, 2023

### New Features
- Support for Perl programming language - explaining Perl code, and converting to another language
### Enhancements
- Improved messages when reloading or replacing existing source code.
- User-added Cells with code can now be submitted for all Boost kernels.

### Bug Fixes
- Fixed handling of nested brackets/braces in Python code
- Do not create whitespace only Cells

## Version 0.9.0: April 4, 2023
### Enhancements
- Improvements to Marketplace display of product installation and usage instructions
- Significantly reduced Extension package size and increased startup time

## Version 0.8.0: March 27, 2023
### Enhancements
- Show Boost logging in Visual Studio Code Output window

### Bug Fixes
- Fix bug causing error output to be lost during Notebook cell update

## Version 0.7.0: March 25, 2023
### New Features
- Support for Visual Studio Code Marketplace

## Version 0.6.0: March 13, 2023
### New Features
- Support for code conversion ("modernization") by selecting target programming language

## Version 0.5.0: February 28, 2023
### New Features
- Support for creating Notebooks and Source Code Analysis
- Support for programming languages:
  - Python
  - Ruby
  - Swift
  - Rust
  - JavaScript
  - TypeScript
  - C\#
- Support for analyzing code for bugs and security issues
- Support for generating unit test cases in Python
- Support for generating documentation for functions in source files
