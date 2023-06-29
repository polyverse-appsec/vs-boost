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
let queue = {};
let started = {};

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
  const progressText = document.getElementById('progress-text') as HTMLElement;
  let text = "";

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

          // update the status field progress-text

          text = 'Now processing file: ' + message.files[0];
          if (message.files.length > 1) {
            text = 'Now processing files: ' + message.files.join(', ');
          }
          //set the inner text of the progress-text div element
          if( progressText ){
            progressText.innerText = text;
          }

          //add the files to the started object
          message.files.forEach( (file: string) => {
            if( !started[message.job]){
              started[message.job] = {};
            }
            started[message.job][file] = true;
          });

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
              
              //if we don't have any active jobs, now show the jobs that are queued up.
              //get the keys of the queue object 
              //after five seconds, refresh the progress text
              setTimeout( () => {
                refreshProgressText(progressText);
              }, 5000);
          }

          // update the status field progress-text

          text = 'Finished processing file: ' + message.files[0];
          if (message.files.length > 1) {
            text = 'Finished processing files: ' + message.files.join(', ');
          }

          if( message.error ){
            text = "Error processing files: " + message.files.join(', ') + " - " + message.error;
          }
          //set the inner text of the progress-text div element
          if( progressText ){
            progressText.innerText = text;
          }  
          
          // now remove the files from the started and queued objects
          message.files.forEach( (file: string) => {
            if( started[message.job] && started[message.job][file] ){
              delete started[message.job][file];
              if( Object.keys(started[message.job]).length === 0 ){
                delete started[message.job];
              }
            }
            if( queue[message.job] && queue[message.job][file] ){
              delete queue[message.job][file];
              if( Object.keys(queue[message.job]).length === 0 ){
                delete queue[message.job];
              }
            } 
          });
          
          //after five seconds, refresh the progress text
          setTimeout( () => {
            refreshProgressText(progressText);
          }, 5000);
          break;
      case 'finishAllJobs':
          // hide the spinner
          spinner?.setAttribute('hidden', '');
          runbutton?.removeAttribute('hidden');
          queue = {};
          started = {};
          break;

      case 'updateSummary':
          // update the progress summary
          if( progressText ){
            progressText.innerText = message.summary;
          } 
          break;
      case 'addQueue':
          if( progressText ){
            progressText.innerText = "Queued " + message.files.join(', ') + " for processing in " + (message.ms / 1000) + "seconds.";
          }
          //loop through each file and add to the queue
          message.files.forEach( (file: string) => {
            if( !queue[message.job]){
              queue[message.job] = {};
            }
            queue[message.job][file] = message.ms;
          });
          break;
  }
}

//this function is called to clear out the 'finished' jobs text and show what is queued up.

function refreshProgressText(progressText: HTMLElement | null) {
  // if there are any started jobs, show those first.
  if( Object.keys(started).length > 0 ){
    const keys = Object.keys(started);
    //loop the keys and show the files
    const files: string[] = [];
    keys.forEach( (key: string) => {
      files.push( Object.keys(started[key]).join(', ') );
    });
    const text = "Processing " + files.join(', ');
    if(progressText){
      progressText.innerText = text;
    }
    return;
  }

  //otherwise, let's check the queue object
  if( Object.keys(queue).length > 0 ){
    const keys = Object.keys(queue);
    //loop the keys and show the files
    const files: string[] = [];
    keys.forEach( (key: string) => {
      files.push( Object.keys(queue[key]).join(', ') );
    });
    const text = "Queued " + files.join(', ') + " in " + (queue[keys[0]][files[0]] / 1000) + "seconds.";
    if(progressText){
      progressText.innerText = text;
    }
    return;
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



