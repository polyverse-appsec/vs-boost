import * as vscode from 'vscode';
import { BoostExtension } from './extension/BoostExtension';
interface BoostNode {
  name: string;
  children?: BoostNode[];
}

class BoostItem extends vscode.TreeItem {
  constructor(
    public readonly name: string,
    public readonly children: BoostNode[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(name, collapsibleState);
    this.tooltip = `${this.label}`;
    this.description = this.label as string;
  }
}

export class BoostTreeDataProvider implements vscode.TreeDataProvider<BoostItem> {
  constructor(private boostExtension: BoostExtension, private section: string) {}

  getTreeItem(element: BoostItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BoostItem): Thenable<BoostItem[]> {
    if (element) {
      return Promise.resolve(this.convertToTreeItems(element.children));
    } else {
      const data = this.boostExtension.getBoostProjectData()[this.section];
      if (data) {
        return Promise.resolve(this.convertToTreeItems(data));
      } else {
        return Promise.resolve([]);
      }
    }
  }

  private convertToTreeItems(nodes: BoostNode[]): BoostItem[] {
    return nodes.map(
      node =>
        new BoostItem(
          node.name,
          node.children || [],
          node.children && node.children.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        )
    );
  }
}

