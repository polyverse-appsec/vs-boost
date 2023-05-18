Polyverse Boost Automatic Application Modernization
======================

# Release Notes

## Version 0.9.7: May 18, 2023

### New Features
- Enabled Automated Folder and Project analysis with Boost kernel commands
- Enabled Boost kernel commands to be run from the Visual Studio Code Command API
- Enabled Boost kernel command to be selected via User configuration setting
- Enabled Boost kernel command search by Title, Description or Command name
- Enabled Markdown doc generation from Boost analysis of Source Files - using new "Generate Markdown" command
- Enabled PDF doc generation from Boost analysis of Source Files - using new "Generate PDF" command

### Enhancements
- Updated Command titles and descriptions for clarity
- Improved error handling for Boost Service issues
- Added Support for Perl Module (PM) files for right-click commands

### Bug Fixes
- Fix issue with building Notebook file from source when no Workspace folder is open
- Fix issue with default configuration values for Test Framework and Default Output Directory
- Fixed broken Marketplace link in README (thank you, customer!)

## Version 0.9.6: May 12, 2023

### Enhancements
- Updated Boost Status bar to show current Boost subscription status and payment status

### Bug Fixes
- Miscaellaneous bug fixes, including intermittent issue with code conversion.

## Version 0.9.5: May 2, 2023

### New Features
- Added usage-based Metered billing for Teams and Enterprise licensing
- Added Customer Account portal UI for managing licenses and billing input only
- Added support for using GitHub organization as Customer id
    NOTE: Existing customers may need to re-authorize GitHub access for Boost due access "Organization" info

### Enhancements
- Enabled Folder and Project processing to build Notebook files in background as files - avoid opening Notebook files in Editor
- Improved visual error messages when an error occurs processing an entire project or folder
- Added analysis of software licenses used in source code to the Architectural Blueprint Summary report

## Version 0.9.4: April 24, 2023

### New Features
- Added support for processing all files in a Project via Command menu "Boost Analysis from Folder"
- Added support for processing multiple files in a Folder via Right-Click menu "Boost Analysis from Folder"
- Added support for .boostignore file in workspace root to exclude files from processing (during Project/Folder processing)
- Added support for Architectural Blueprint Summary report across functions and files

### Enhancements
- Improved error messages on some network timeouts
- Source Analysis (Data Compliance, Security Vulnerabilities, etc) include links to online web resources to additional education and background
- Test Code Generation includes links to training material on recommended test design and test framework

### Bug Fixes
- Enable support for processing Perl Module files (*.pm)
- Fix issue where Compliance analysis results overwrote Explanation analysis results

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
