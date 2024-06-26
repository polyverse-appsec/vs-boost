import {
  provideVSCodeDesignSystem,
  vsCodeLink,
  vsCodeButton,
  Button
} from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeLink(), vsCodeLink());

// Get access to the VS Code API from within the webview context
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
  const howdyButton = document.getElementById("analyze_all") as Button;
  howdyButton?.addEventListener("click", handleAnalyzeAllClick);

  const blueprintLink = document.getElementById("blueprint-link") as HTMLAnchorElement;
  blueprintLink?.addEventListener("click", openFile);

  const guidelinesLink = document.getElementById("guidelines-link") as HTMLAnchorElement;
  guidelinesLink?.addEventListener("click", openFile);
}

// Callback function that is executed when the howdy button is clicked
function handleAnalyzeAllClick() {
  vscode.postMessage({
    command: "show_summary"
  });
}

function openFile(event) {
  const path = event.target.getAttribute("href");
  vscode.postMessage({
      command: 'open_file',
      file: path
  });
}

  // Some quick background:
  //
  // Webviews are sandboxed environments where abritrary HTML, CSS, and
  // JavaScript can be executed and rendered (i.e. it's basically an iframe).
  //
  // Because of this sandboxed nature, VS Code uses a mechanism of message
  // passing to get data from the extension context (i.e. src/panels/HelloWorldPanel.ts)
  // to the webview context (this file), all while maintaining security.
  //
  // vscode.postMessage() is the API that can be used to pass data from
  // the webview context back to the extension context––you can think of
  // this like sending data from the frontend to the backend of the extension.
  //
  // Note: If you instead want to send data from the extension context to the
  // webview context (i.e. backend to frontend), you can find documentation for
  // that here:
  //
  // https://code.visualstudio.com/api/extension-guides/webview#passing-messages-from-an-extension-to-a-webview
  //
  // The main thing to note is that postMessage() takes an object as a parameter.
  // This means arbitrary data (key-value pairs) can be added to the object
  // and then accessed when the message is recieved in the extension context.
  //
  // For example, the below object could also look like this:
  //
  // {
  //  command: "hello",
  //  text: "Hey there partner! 🤠",
  //  random: ["arbitrary", "data"],
  // }
  //