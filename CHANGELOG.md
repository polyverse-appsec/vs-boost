Polyverse Boost Automatic Application Modernization
======================

# Release Notes

## Version 1.6.0: September 22nd, 2023

### New Features
- Automatically add Boost extension recommendation to any project that is analyzed (can be disabled by global advanced configuration setting)
- Added searchable product help documentation to the Boost Activity Bar Chat window

### Enhancements
- Inline source analysis hover includes clearer Boost logo, buttons and access to more analysis details
- Severity filter can be set in Workspace configuration - any Problems below the filter will be hidden (default is 7 / Error)
- Disabled by default legal analysis kernels: Single function blueprint, Coding Guidelines, Function Summary
    - Quick Blueprint and Custom Scan have replaced these for most scenarios
- Removed legacy analysis picker from status bar - replaced by Activity Bar
- Enable direct Analysis selection when right-clicking source for analysis
- Inline Source Analysis results are shown in the Chat window

### Bug Fixes
- Fix for Analysis Estimate not refreshing after analysis completes
- Ensure hover analysis is only shown in source code windows (avoiding stale analysis in Problems or Output windows)
- Fix issue causing multiple hover decorators to appear on every line of a source selection with the same or similar analysis results

## Version 1.5.1: September 15th, 2023

### New Features
- N/A

### Enhancements
- Change Diagnostic Problems to Warning by default when Analysis of source code is not successful to avoid blocking user code build
- Use .boostignore and .gitignore files only for source exclusion - and stop using .vscodeignore (which is specific to Extension development)
- Reduce redundant status updates and flicker
- Source-level problems include the display category (e.g. Compliance, Security, etc.) for easier filtering
- Enable UI-based refresh of Analysis Summary for a single file

### Bug Fixes
- Fixed issue preventing output generation when Notebook conversion language or test framework is changed via UI toolbar
- Fix issue in Test Generation with markdown output generation
- Fix issue with Code Conversion service error handling that can cause Extension startup errors
- Fix issue with Analysis Type checkbox resetting to true after restart
- Fix issue with analysis mode (Sample or All Files) being set incorrectly
- Reduce Output window error messages when accessing inline Editor analysis results
- Fix refresh issue with Architectural Blueprint and Project-level Summaries for Security and Compliance

## Version 1.5.0: September 7th, 2023

### New Features
- Code Editor includes inline 'grayed' summary of any available documentation or detected issues from analysis
- Code Editor provides hover/pop-up analysis for any code that has been analyzed
- Command added for offline automation to set user organization

### Enhancements
- Improved startup synchronization to ensure user initiated UI commands wait for startup to complete before executing

### Bug Fixes
- N/A

## Version 1.4.0: September 1st, 2023

### New Features
- N/A

### Enhancements
- Chat includes detailed Boost analysis for selected or active source file in the Visual Studio Code Text Editor
- Analysis checkboxes and radio buttons persist across restarts in Activity Bar

### Bug Fixes
- N/A

## Version 1.3.2: August 29th, 2023

### New Features
- Sara Chat can be used to analyze open files, and ask questions about key analysis
- Chat and source analysis include all key security, performance and compliance analysis

### Enhancements
- Project Analysis Summary and File Analysis Output are automatically generated during UI analysis runs
- Improvements to readability, style and source line numbers in HTML and PDF output
- Enabled Right-click in File Explorer for showing PDF, HTML and Markdown of any Boost Notebook
- All Output files are stored in Boost Output folder - for ease of packaging and publishing
- Analysis Output generation command can generate all formats by using format "all"
- Markdown Output formatting and layout improvements
- Enable Executive Report Summaries for individual source files
- Include Analysis Summary in Detailed Files Analysis Output files
- Default Format Output for all Analysis is PDF (was Markdown)

### Bug Fixes
- Fixed issue preventing status bar account status from updating when no Project folder is loaded
- Fixed issue where UI reports 'activating' indefinitely when no Project folder is loaded
- Stability improvements in source parsing and output generation
- Ensure File Summary output includes summary file extension
- Fixed omission of Warnings from Quick Summary Executive Reports for Performance, Security and Compliance
- Fix minor cosmetic rendering issue with some filenames in UI Dashboard

## Version 1.3.1: August 15th, 2023

### New Features
- N/A

### Enhancements
- Reduce verbose analysis workflow logging by default

### Bug Fixes
- Ensure Error messages are shown in logs and UI by default
- Check account status before running analysis - and show error if account is expired or canceled
- Fix logging error when rebuilding source notebook files

## Version 1.3.0: August 14th, 2023

### New Features
- Default analysis by "Run Selected Analyses" in the Activity Bar will run against a sample or trial of the currently loaded project, including estimated cost.
- Project analysis has been significantly improved to increasing batches of files - including processing analyzing file completely before continuing to next file.
- Support for analyzing ONLY selected files in a project folder - using .boostOnly file (similar to .boostIgnore)

### Enhancements
- Analysis of files is automatically prioritized based on perceived value and relevance to the project.
- Rebuild Executive Report Summary for Security, Compliance and Blueprint on every analysis run
- File analysis will continue even if another file or part of analysis fails.
- "Run Selected Analyses" will abort quickly if user account has an expired trial, past due payment or canceled subscription
- Analysis errors launched from Activity Bar UX will be shown in a Visual Studio Code popup window (in addition to Output tab)
- Project Blueprint is regenerated / refreshed at the start of all analysis runs to improve analysis and prioritize order of file analysis

### Bug Fixes
- Ensure Analysis Output files (e.g. PDF, HTML or Markdown) are only generated for source files under analysis (e.g. don't include ignored files)
- Fix rare informational logging messages shown as popup notifications during automated analysis
- Job state is reset to idle on Project load or Visual Studio Code restart - in case of abort or crash during analysis

## Version 1.2.5: August 8th, 2023

### New Features
- None

### Enhancements
- Ensure automated generation of .BoostIgnore file is only done if user has not created one manually
- Ensure prediction of analysis costs are reset when opening a new project folder

### Bug Fixes
- Fixes to ensure Activity Bar progress meter updates consistently
- Fix for Quick Project Blueprint generation to fully complete before starting project Documentation generation
- Ensure Executive Summary Reports are completed before saving Summary notebook to disk
- Ensure analysis of selected code in active text editor is complete before showing results in Problems tab

## Version 1.2.4: August 4th, 2023

### New Features
- New and Improved Activity Bar UI - Tabbed views showing more content and progress
- Full account status is shown in Activity Bar - including Trial or Credit remaining, monthly usage and balance
- Boost Sara AI Assistant provides estimated time and cost for analysis before selecting "Run Selected Analyses"
- Added support for analyzing Razor files (CSHTML extension, HTML with embedded C# or Visual Basic.NET)
- Added support for analyzing Salesforce Apex files (Visual Studio Code APEX extension not required for analysis)

### Enhancements
- Enable right-click Menus for Compiled Python files (*.pod)
- Summary view provides clickable links to documentation
- Rebuild/reparse all source files during analysis if not analysis output will be lost
- Errors are treated as Warnings by default in Diagnostic Problems to avoid blocking build
- Report Canceled account status for users who have canceled their subscriptions
- Pick the best Test Framework for any test case generation instead of using Pytest by default

### Bug Fixes
- Fix links in Summary View

## Version 1.2.3: July 28th, 2023

### New Features
- N/A

### Enhancements
- N/A

### Bug Fixes
- Enable Quick Summary reports by default
- Fixes to Summary view progress tracking and "Run" button state

## Version 1.2.2: July 27th, 2023

### New Features
- Added new Summary Reports run after compliance, security and performance scans of code to produce high-level report of most severe issues and impact

### Enhancements
- Improved UX Activity Tab responsiveness and status reporting during initial startup
- Improved UX Activity Tab responsiveness and status when no folder is open
- Improved Diagnostic Problems reporting - using correct severity and issue type / category
- Improved Diagnostic Problems to provide solution to problem where possible

### Bug Fixes
- Fix Project data cache Summary Uri to be relative for crossing systems and users
- Fix issue that prevented .boostignore file being used

## Version 1.1.1: July 21st, 2023

### New Features
- N/A

### Enhancements
- Support excluding files and folders from Analysis by right-click "Exclude..." context-menu in File Explorer (writes exclusions to .boostignore file)
- Initial Blueprinting of your software project will automatically generate an analysis exclusion list (aka .boostignore) file based on the files in your project and your project type
- Analysis Errors are now loaded immediately on Project/Folder Load, without manually opening the Notebook with the errors
- Source-level Errors are loaded in Diagnostic Collections "Problems" for each area - e.g. "Security", "Data Compliance", "Performance"
- Added support for 'Vue' Framework source files - including tokenization and File Explorer Context Menus
- Added support .gitignore - Analysis engine will ignore project files and folders that are likely transient

### Bug Fixes
- Restore Summarization of all analysis across project in Boost UX tab
- Restore support for loading Errors in cell or Notebook analysis on Notebook load
- Fixed issue where only latest cell being analyzed has Diagnostic Problems shown in Problems tab
- Fixed issue where Diagnostic Problems in deleted cells were not removed
- Fixed issue with Quick Blueprint failing via UI when Boost Summary file is created via UI
- Blueprinting resilience to empty projects
- Fix source line offset in Diagnostic Problems
- Improved source line matching for code parsing into Cells

## Version 1.1.0: July 12th, 2023

### New Features
- Significantly improved UX around scan progress tracking, reliability in Summary View in Activity Bar
    - includes visualization of individual files and folders
    - includes visual color coding for status of each file and folder and type of scan
    - improved performance of UI updates, reduced startup time, and improved reliability when restarting VSC or reopening Activity tab
- Introducing Sara, the Boost Smart Architectural Reasoning Assistant, who can answer questions about Boost-analyzed software projects.
- New Performance analysis Kernel - characterizes performance of code and potential issues with 3rd party frameworks
- New Performance quick-scan source analysis Kernel - scans code for specific issues in code and creates problems and solutions for followup
- Added Quick Draft Architectural Blueprint Summary Kernel - based on hints about project structure, files and data
    NOTE: Quick blueprints are only generated when a detailed Summary blueprint is not available
- Added Project-level Analysis Command - processProject - which supports Quick Blueprint only currently

### Enhancements
- Deep code analysis runs after quick doc, compliance and security scans
- Chat requests now integrate overall project summary blueprint and guidelines as part of the analysis
- Improved error handling for network errors when processing Chat requests

### Bug Fixes
- Fixed a bug where some source file analysis was failing due to line number issues
- Do not include Errors in summarization of cells and notebooks
- Fix issue with Summaries of output including duplicate timestamps and headers
- Fix path normalization issue with Boost folders on Windows platform

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
