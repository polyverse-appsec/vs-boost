import {
    provideVSCodeDesignSystem,
    vsCodeButton,
    vsCodeTextArea,
    vsCodeRadio,
    vsCodeRadioGroup,
    vsCodePanels,
    vsCodePanelTab,
    vsCodePanelView,
    vsCodeProgressRing,
    Button
} from "@vscode/webview-ui-toolkit";

provideVSCodeDesignSystem().register(vsCodeButton(), vsCodeTextArea(), vsCodeRadio(), vsCodeRadioGroup(),
    vsCodePanels(), vsCodePanelTab(), vsCodePanelView(), vsCodeProgressRing());

const vscode = acquireVsCodeApi();

// Just like a regular webpage we need to wait for the webview
// DOM to load before we can reference any of the HTML elements
// or toolkit components
window.addEventListener("load", main);

// Listen for the simulated send event to from an external processor
window.addEventListener("message", handleIncomingChatMessage);

// Main function that gets executed once the webview DOM loads
function main() {
    // To get improved type annotations/IntelliSense the associated class for
    // a given toolkit component can be imported and used to type cast a reference
    // to the element (i.e. the `as Button` syntax)
    const howdyButton = document.getElementById("send") as Button;
    howdyButton?.addEventListener("click", handleSendClick);

    //now add listeners for the add and close buttons. we don't know how many so we need to loop
    const closeButtons = document.getElementsByClassName("tab-close-button") as HTMLCollectionOf<Button>;
    for (let i = 0; i < closeButtons.length; i++) {
        closeButtons[i].addEventListener("click", handleCloseClick);
    }

    //add a listener for the add button
    const addButton = document.getElementById("tab-add-button") as Button;
    addButton?.addEventListener("click", handleAddClick);

    // Add event listeners for the message divs
    let idx : number = 0;
    while (true) {

        const messageDiv = document.getElementById(`chat-message-${idx}`);
        if (!messageDiv) {
            break;
        }

        // create a closure around currentIdx so that it is captured
        (function(currentIdx) {
            messageDiv.addEventListener("click", () => handleDivClick(currentIdx));
        })(idx);

        idx++;
    }
}

function handleDivClick(messageIndex : number) {
    vscode.postMessage({
        command: "toggle-chat-status",
        messageIndex: messageIndex
    });
}

function handleIncomingChatMessage(event: MessageEvent) {
    const message = event.data; // The JSON data our extension sent

    switch (message.command) {
        case "chat-send-button-click": {
            updateChatButtonForProcessing(event.data.externalPromptData);
            break;
        }
        case "new-prompt": {
            vscode.postMessage({
                command: "new-prompt",
                ...event.data
            });
            break;
        }
        case "toggle-chat-status": {
            vscode.postMessage({
                command: "toggle-chat-status",
                ...event.data
            });
            break;
        }
    }
}

function handleAddClick() {
    vscode.postMessage({
        command: "add-chat"
    });
}

//for the close click, we need to know which one was clicked. we can get that from the id
function handleCloseClick(event: Event) {
    const closeButton = event.target as HTMLElement;
        // in case we get the close click from the actual HTML button inside
        //    the vscode-button, we need to get the parent
    const vscodeButton = closeButton.closest("vscode-button") as HTMLElement;
    let id = closeButton.id;
    if (!id) {
        id = vscodeButton.id;
    }
    vscode.postMessage({
        command: "close-chat",
        chatindex: id.split("-")[1]
    });
}

// Callback function that is executed when the howdy button is clicked
//      or when called from an external message source
function handleSendClick() {
    updateChatButtonForProcessing();
}

function updateChatButtonForProcessing(externalPromptData? : string) {
    // get the value of the radio button
    const chatGroup = document.getElementById("chat-group") as HTMLElement;
    const chatid = chatGroup.getAttribute("activeid");
    const chatindex = chatid?.split("-")[1];

    const sendButton = document.getElementById("send") as Button;
    const progressRing = document.getElementById("progress") as HTMLElement;
    const promptBox = document.getElementById("prompt") as HTMLTextAreaElement;

    if (externalPromptData && promptBox) {
        promptBox.value = externalPromptData;
    }
    const promptData = promptBox?.value;
    if (!promptData) {
        return;
    }

    // disable the button and show the progress ring by adding/removing the hidden attribute
    sendButton.setAttribute("hidden", "");
    promptBox.setAttribute("disabled", "");

    progressRing.removeAttribute("hidden");

    // if processing in external code, then just returm without
    //  sending the prompt to this service
    if (externalPromptData) {
        return;
    }

    vscode.postMessage({
        command: "new-prompt",
        chatindex: chatindex,
        showUI: true,
        prompt: promptData,
        externalProcessing: externalPromptData !== undefined
    });
}