import {
  provideVSCodeDesignSystem,
  vsCodeButton,
  vsCodeTextArea,
  vsCodeRadio,
  vsCodeRadioGroup,
  vsCodePanels,
  vsCodePanelTab,
  vsCodePanelView,
  Button
} from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeTextArea(), vsCodeRadio(), vsCodeRadioGroup(),
  vsCodePanels(), vsCodePanelTab(), vsCodePanelView());

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
  // get the value of the radio button
  const gpt35 = document.getElementById("gpt35") as HTMLElement;
  const checked = gpt35.getAttribute("current-checked");

  let model = "gpt-4";
  if( checked === "true" ) {
    model = "gpt-3.5-turbo";
  } 
  
  vscode.postMessage({
    model: model,
    command: "newprompt",
    prompt: (document.getElementById("prompt") as HTMLTextAreaElement)?.value 
  });
}