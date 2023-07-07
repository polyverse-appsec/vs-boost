Polyverse Boost Automatic Application Modernization
======================

# Release Notes

## Version 1.1.0: July 6th, 2023

### New Features
- Significantly improved UX around scan progress tracking, reliability in Summary View in Activity Bar
    - includes visualization of individual files and folders
    - includes visual color coding for status of each file and folder and type of scan
    - improved performance of UI updates, reduced startup time, and improved reliability when restarting VSC or reopening Activity tab
- New Performance analysis Kernel - characterizes performance of code and potential issues with 3rd party frameworks
- New Performance quick-scan source analysis Kernel - scans code for specific issues in code and creates problems and solutions for followup
- Added Quick Draft Architectural Blueprint Summary Kernel - based on hints about project structure, files and data
    NOTE: Quick blueprints are only generated when a detailed Summary blueprint is not available
- Added Project-level Analysis Command - processProject - which supports Quick Blueprint only currently

### Enhancements
- Deep code analysis runs after quick doc, compliance and security scans

### Bug Fixes
- Fixed a bug where some source file analysis was failing due to line number issues

## Version 1.0.4: June 28, 2023

### New Features
- Enable User-Editable Project Guidelines and Best Practices to be used in analysis
- New command showGuidelines to show the the editable Guidelines for the Project or any specific area (e.g. Security, Documentation, Compliance, etc.)

### Enhancements
- Boost will not analyze binary files (e.g. images, movies, zip files, etc) - and will not generate Boost Notebooks

### Bug Fixes
- Fix bug in Boost Activity Tab 'Start' panel Summary link causing creation of invalid Summary file (invalid JSON error)
- Fix Chat to use the latest Analysis Summary for all processing
- Display Flow Diagrams in Documentation Summary Activity Bar tab
- Fix issue with empty Analysis summaries not printing a message
- Fix issue with Analysis Summary not being loaded correctly into the Chat context on startup
- Remove redundant 'model' radio button from Chat window - default is used, unless the Boost configuration is changed on the project
- Don't persist chat errors - to ensure they aren't used with the later analysis

## Version 1.0.3: June 23, 2023

### New Features
- New Fast Data and Privacy Compliance Scan with source line mapping and solution recommendations

### Enhancements
- N/A

### Bug Fixes
- Fix potential timing issue with Jobs reporting in Summary Activity Bar tab
- Enable Fast Security Scan in Summary Activity Bar Tab

## Version 1.0.2: June 23, 2023

### New Features
- New Fast Security Scan with source line mapping and solution recommendations
- New Boost specific Diagnostic/Problems tab - showing identified issues in source code with analysis and line numbers and link to original file
    NOTE: Currently, existing Boost Notebooks will need to be rebuilt from original source to include precise source line mappings

### Enhancements
- Improvements to Mermaid rendering in Summary views

### Bug Fixes
- Fix issue with Boost Activity Bar 'Run All' handling of checked Analysis Types
- Fix missing Mime-Type in some Test Generation outputs

### Known Issues
- N/A

## Version 1.0.1: June 22, 2023

### New Features
- Building and showing exported results in HTML format (PDF and Markdown previously supported)
- Enable analysis of selected text in Source Code Text Editor - via right-click "Boost Analyze Selected Text" command
- Enable AI Chat window for Source and Architectural analysis

### Enhancements
- Use File Explorer right-click commands to show Analysis details and Summaries for all Source files and Project
- Improved handling for Git errors when Git software is not installed

### Bug Fixes
- Disable Chat text box while Boost Cloud Service is processing request
- Fix issue with Chat history on secondary chat windows
- Enable closing of 1st chat window when multiple chat windows are open

### Known Issues
- Flow Diagrams may not render correctly in Summary view

## Version 1.0.0: June 19, 2023

### New Features
- N/A

### Enhancements
- Support for processing large files and large functions
- Add support for Paste to Chat window text box
- Add support for any 'unknown' text file to be loaded and analyzed - regardless of file extension, or no file extension
- Improved resiliency of batch-mode and large input processing
- Improved Boost UX tab to show progress and status of Summarization of all analysis across project
- Improved resiliency of client and server under load or at peak processing times

### Bug Fixes
- Fixed broken Chat button when a Boost Cloud Service failure occurs
- Ensure error message is saved to cell Output

### Known Issues
- Flow Diagrams may not render correctly in Summary view

## Version 0.9.9: June 10, 2023

### New Features
- new UX - Boost Tab view on left side of Visual Studio Code, includes:
  * Introduction to Boost with "Analyze All" button
  * Project Analysis Summary view - status of all files in a project
  * Live Chat window enabling iterative analysis, questions and AI-enabled recommendations based on the Project Blueprints, Analysis and documentation
  * Summarized analysis across Project - including Documentation, Architectural Blueprint, Data Compliance, and Security Vulnerabilities
- Summary analysis of a complete source file is available in the side-by Boost Notebook file (e.g. `SOURCE_FILENAME.summary.boost-notebook`)
- Summary analysis of an entire project or folder is available in the side-by Boost Notebook file (e.g. `PROJECT_NAME_OR_FOLDER_NAME.summary.boost-notebook`)

### Enhancements
- Running analysis across a source file will only refresh the Error or missing Outputs (refresh always is available by Configuration Setting)
- Flow Control diagrams show function name in the diagram, and calls to external functions and libraries
- Analysis of folders and files will now include popular build/project file formats, including Makefiles, CMakeLists.txt, and XCode, Maven, Gradle, Rakefile, and Visual Studio project files
- Launching "Process" of a file or folder/project will automatically create Boost notebooks from the source files
- Right-Click any source file in the Explorer and select "Open Detailed Analysis Notebook" or "Open Summary Analysis Notebook" to open existing analysis or load it for manual analysis

### Bug Fixes
- Fixed bug creating Boost Notebooks for a standalone source file outside of a loaded Workspace folder
- Fixed bug where right-click didn't open a new Boost Notebook if current active window has a Boost Notebook already open

## Version 0.9.8: May 26, 2023

### New Features
- Add support for CoffeeScript code files
- Add support for XSLT code files

### Enhancements
- Added a dividing horizontal line between analysis results in the Notebook Cell Outputs (visual UI, Markdown, and PDF)

### Bug Fixes
- N/A

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
- Fixed broken Marketplace link in README (cheers and thank you, customer!)
- Fixed potential issue with some individual source files being parsed and loaded into a new Notebook (cheers thank you, customer!)

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
