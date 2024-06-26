import * as assert from "assert";
import * as vscode from "vscode";
import { NOTEBOOK_TYPE } from "../../data/jupyter_notebook";

suite("Extension Commands", () => {
    vscode.window.showInformationMessage("Start Command verification tests.");

    test("createJsonNotebook command should be present", (done) => {
        assert.ok(
            vscode.commands.getCommands().then((cmds) => {
                return (
                    cmds.indexOf(NOTEBOOK_TYPE + ".createJsonNotebook") !== -1
                );
            })
        );
        done();
    });

    test("loadCodeFile command should be present", (done) => {
        assert.ok(
            vscode.commands.getCommands().then((cmds) => {
                return cmds.indexOf(NOTEBOOK_TYPE + ".loadCodeFile") !== -1;
            })
        );
        done();
    });

    test("selectOutputLanguage command should be present", (done) => {
        assert.ok(
            vscode.commands.getCommands().then((cmds) => {
                return (
                    cmds.indexOf(NOTEBOOK_TYPE + ".selectOutputLanguage") !== -1
                );
            })
        );
        done();
    });

    test("selectTestFramework command should be present", (done) => {
        assert.ok(
            vscode.commands.getCommands().then((cmds) => {
                return (
                    cmds.indexOf(NOTEBOOK_TYPE + ".selectTestFramework") !== -1
                );
            })
        );
        done();
    });

    test("customerPortal command should be present", (done) => {
        assert.ok(
            vscode.commands.getCommands().then((cmds) => {
                return cmds.indexOf(NOTEBOOK_TYPE + ".customerPortal") !== -1;
            })
        );
        done();
    });

    test("boostStatus command should be present", (done) => {
        assert.ok(
            vscode.commands.getCommands().then((cmds) => {
                return cmds.indexOf(NOTEBOOK_TYPE + ".boostStatus") !== -1;
            })
        );
        done();
    });

    test("loadCurrentFile command should be present", (done) => {
        assert.ok(
            vscode.commands.getCommands().then((cmds) => {
                return cmds.indexOf(NOTEBOOK_TYPE + ".loadCurrentFile") !== -1;
            })
        );
        done();
    });

    test("loadCurrentFolder command should be present", (done) => {
        assert.ok(
            vscode.commands.getCommands().then((cmds) => {
                return (
                    cmds.indexOf(NOTEBOOK_TYPE + ".loadCurrentFolder") !== -1
                );
            })
        );
        done();
    });

    test("processCurrentFile command should be present", (done) => {
        assert.ok(
            vscode.commands.getCommands().then((cmds) => {
                return (
                    cmds.indexOf(NOTEBOOK_TYPE + ".processCurrentFile") !== -1
                );
            })
        );
        done();
    });

    test("processCurrentFolder command should be present", (done) => {
        assert.ok(
            vscode.commands.getCommands().then((cmds) => {
                return (
                    cmds.indexOf(NOTEBOOK_TYPE + ".processCurrentFolder") !== -1
                );
            })
        );
        done();
    });
});
