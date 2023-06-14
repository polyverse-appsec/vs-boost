import {
  provideVSCodeDesignSystem,
  vsCodeBadge,
  vsCodeButton,
  vsCodeDataGrid,
  vsCodeDataGridCell,
  vsCodeDataGridRow,
  vsCodeCheckbox,
  vsCodeProgressRing,
  Button
} from "@vscode/webview-ui-toolkit";

import {CountUp} from 'countup.js';

provideVSCodeDesignSystem().register(
  vsCodeButton(), 
  vsCodeBadge(), 
  vsCodeDataGrid(), 
  vsCodeDataGridCell(), 
  vsCodeDataGridRow(), 
  vsCodeCheckbox(),
  vsCodeProgressRing()
  );

const vscode = acquireVsCodeApi();

let options = {
  useEasing: true,
  useGrouping: true,
  separator: ',',
  decimal: '.',
  formattingFn: (value) => {
      return value === 1 ? `${value} job running` : `${value} jobs running`;
  }
};


// Just like a regular webpage we need to wait for the webview
// DOM to load before we can reference any of the HTML elements
// or toolkit components
window.addEventListener("load", main);
window.addEventListener("message", handleIncomingSummaryMessage);

let jobCounters = {};

// Main function that gets executed once the webview DOM loads
function main() {
  // To get improved type annotations/IntelliSense the associated class for
  // a given toolkit component can be imported and used to type cast a reference
  // to the element (i.e. the `as Button` syntax)
  const howdyButton = document.getElementById("update-summary") as Button;
  howdyButton?.addEventListener("click", handleAnalyzeAllClick);
}

// Callback function that is executed when the howdy button is clicked
function handleAnalyzeAllClick() {
  //TODO: we need to show what is checked in the grid.
  vscode.postMessage({
    command: "analyze_all",
    analysisTypes: getAnalysisTypes()
  });
}

function handleIncomingSummaryMessage(event: MessageEvent) {
  const message = event.data; // The JSON data our extension sent
  const spinner = document.getElementById('job-progress');
  const runbutton = document.getElementById('update-summary');

  switch (message.command) {
      case 'addJobs':
          // set our spinner

          spinner?.removeAttribute('hidden');
          runbutton?.setAttribute('hidden', '');

          // first unhide the counter
          const counter = document.getElementById('job-' + message.job);
          counter?.removeAttribute('hidden');

          // if we don't have a job counter for this job, add it
          if (!jobCounters[message.job]) {
              jobCounters[message.job] = new CountUp('job-' + message.job, message.count, options);
          }
          //start the counter
          jobCounters[message.job].update(message.count);
          break;
      case 'finishJobs':
          // if we don't have a job counter for this job, add it  
          if (!jobCounters[message.job]) {
              jobCounters[message.job] = new CountUp('job-' + message.job, 0, options);
          }
          //start the counter
          jobCounters[message.job].update(message.count); 

          // if count is now zero, hide the element
          if (message.count === 0) {
              const counter = document.getElementById('job-' + message.job);
              counter?.setAttribute('hidden', '');
              // hide the spinner
              spinner?.setAttribute('hidden', '');
              runbutton?.removeAttribute('hidden');
          }
          break;
  }
}

function getAnalysisTypes(): Array<string> {
  const analysisTypes: string[] = [];
  const checkboxes = document.querySelectorAll('vscode-checkbox[analysis-check]');

  checkboxes.forEach((checkbox: Element) => {
      const id: string | null = (checkbox as HTMLElement).getAttribute('id');
      const isChecked: boolean = (checkbox as HTMLElement).classList.contains('checked');
      if(id && isChecked ) {
          const match = id.match(/check-(.+)/);
          if (match && match[1]) {
              analysisTypes.push(match[1]);
          }
      }
  });

  return analysisTypes;
}



