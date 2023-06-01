import {
  provideVSCodeDesignSystem,
  vsCodeButton,
  vsCodeTextArea,
  Button
} from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeTextArea());

const vscode = acquireVsCodeApi();

// Just like a regular webpage we need to wait for the webview
// DOM to load before we can reference any of the HTML elements
// or toolkit components
window.addEventListener("load", main);

// Main function that gets executed once the webview DOM loads
function main() {
  // To get improved type annotations/IntelliSense the associated class for
  // a given toolkit component can be imported and used to type cast a reference
  // to the element (i.e. the `as Button` syntax)
  const howdyButton = document.getElementById("send") as Button;
  howdyButton?.addEventListener("click", handleSendClick);
}

// Callback function that is executed when the howdy button is clicked
function handleSendClick() {
  //TODO: we need to show what is checked in the grid.
  vscode.postMessage({
    command: "newprompt",
    prompt: (document.getElementById("prompt") as HTMLTextAreaElement)?.value 
  });
}