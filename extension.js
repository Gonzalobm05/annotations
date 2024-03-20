const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Function to get the path for storing annotations
function getAnnotationsFilePath() {
    const workspacePath = vscode.workspace.rootPath;
    return path.join(workspacePath, '.annotations.json');
}

// Function to save annotations to a file
function saveAnnotations(annotations, filePath) {
    fs.writeFileSync(filePath, JSON.stringify(annotations, null, 4), 'utf8');
}

// Function to load annotations from a file
function loadAnnotations(filePath) {
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    }
    return [];
}

// Function to update the decorations (colored markers)
function updateDecorations() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }

    const annotations = loadAnnotations(getAnnotationsFilePath());
    const decorationType = vscode.window.createTextEditorDecorationType({
        borderWidth: '1px',
        borderStyle: 'solid',
        overviewRulerColor: 'red',
        overviewRulerLane: vscode.OverviewRulerLane.Right,
        light: {
            // This color will be used in light color themes
            borderColor: 'darkred'
        },
        dark: {
            // This color will be used in dark color themes
            borderColor: 'lightcoral'
        }
    });

    const ranges = annotations.map(annotation => {
        if (annotation.filePath === activeEditor.document.fileName) {
            const lineNumber = annotation.lineNumber - 1; // Adjust for zero-based index
            const line = activeEditor.document.lineAt(lineNumber);
            return new vscode.Range(line.range.start, line.range.end);
        }
    }).filter(range => range);

    activeEditor.setDecorations(decorationType, ranges);
}

// Function to create a new annotation
async function createAnnotation() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }

    const lineNumber = activeEditor.selection.active.line + 1; // Convert to one-based index
    const input = await vscode.window.showInputBox({
        prompt: 'Enter your annotation'
    });

    if (input) {
        const annotationsFilePath = getAnnotationsFilePath();
        const annotations = loadAnnotations(annotationsFilePath);
        annotations.push({ filePath: activeEditor.document.fileName, lineNumber, annotation: input });
        saveAnnotations(annotations, annotationsFilePath);
        updateDecorations();

        // Refresh the custom view
        vscode.commands.executeCommand('extension.createAnnotationsView');
    }
}

// Function to show all annotations in a sidebar
function showAnnotations() {
    const annotationsFilePath = getAnnotationsFilePath();
    const annotations = loadAnnotations(annotationsFilePath);
    const panel = vscode.window.createWebviewPanel(
        'annotationsPanel',
        'Annotations',
        vscode.ViewColumn.Two,
        {}
    );
    let htmlContent = '<h1>Annotations</h1>';
    annotations.forEach(annotation => {
        htmlContent += `<p>${annotation.filePath}, Line ${annotation.lineNumber}: ${annotation.annotation}</p>`;
    });
    panel.webview.html = htmlContent;
}

// Function to create a custom view to show annotations grouped by file
function createAnnotationsView() {
    const view = vscode.window.createTreeView('annotationsView', {
        treeDataProvider: new AnnotationsDataProvider()
    });
    return view;
}

// Tree data provider for the custom view
class AnnotationsDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    async getChildren(element) {
        if (!element) {
            const annotationsFilePath = getAnnotationsFilePath();
            const annotations = loadAnnotations(annotationsFilePath);
            const groupedAnnotations = this.groupAnnotationsByFile(annotations);
            return Object.keys(groupedAnnotations).map(fileName => {
                const sortedAnnotations = groupedAnnotations[fileName].sort((a, b) => a.lineNumber - b.lineNumber);
                return new AnnotationFileItem(fileName, sortedAnnotations);
            });
        }
        return element.annotations.map(annotation => {
            return new AnnotationItem(annotation);
        });
    }

    groupAnnotationsByFile(annotations) {
        const groupedAnnotations = {};
        annotations.forEach(annotation => {
            if (!groupedAnnotations[annotation.filePath]) {
                groupedAnnotations[annotation.filePath] = [];
            }
            groupedAnnotations[annotation.filePath].push(annotation);
        });
        return groupedAnnotations;
    }
}

// Tree item for file in the custom view
class AnnotationFileItem extends vscode.TreeItem {
    constructor(fileName, annotations) {
        super(fileName, vscode.TreeItemCollapsibleState.Collapsed);
        this.annotations = annotations;
    }
}
class AnnotationItem extends vscode.TreeItem {
    constructor(annotation) {
        super(`Line ${annotation.lineNumber}: ${annotation.annotation}`);
        this.annotation = annotation;
        this.command = {
            command: 'extension.jumpToAnnotation',
            title: '',
            arguments: [annotation]
        };
        this.contextValue = 'annotationItem';
    }
}

// Function to activate the extension
function activate(context) {
    console.log('Annotation extension is now active');

    // Command to create a new annotation
    let disposable = vscode.commands.registerCommand('extension.createAnnotation', createAnnotation);
    context.subscriptions.push(disposable);

    // Command to show all annotations in a sidebar
    disposable = vscode.commands.registerCommand('extension.showAnnotations', showAnnotations);
    context.subscriptions.push(disposable);

    // Command to jump to the annotation's location
    disposable = vscode.commands.registerCommand('extension.jumpToAnnotation', jumpToAnnotation);
    context.subscriptions.push(disposable);

    // Command to edit the annotation
    disposable = vscode.commands.registerCommand('extension.editAnnotation', editAnnotation);
    context.subscriptions.push(disposable);

    // Register custom view to show annotations
    context.subscriptions.push(vscode.window.registerTreeDataProvider('annotationsView', new AnnotationsDataProvider()));
    disposable = vscode.commands.registerCommand('extension.createAnnotationsView', createAnnotationsView);
    context.subscriptions.push(disposable);

    // Register event handler for text document changes (to update decorations)
    vscode.workspace.onDidChangeTextDocument(updateDecorations);
    updateDecorations(); // Initial decorations update

    // Register context menu for annotation items
    vscode.window.registerTreeItemContextProvider('annotationsView', {
        provideTreeItemMenus: (item) => {
            if (item instanceof AnnotationItem) {
                return [{
                    label: 'Edit Annotation',
                    command: 'extension.editAnnotation',
                    arguments: [item.annotation]
                }];
            }
            return [];
        }
    });
}

// Function to edit the annotation
async function editAnnotation(annotation) {
    const input = await vscode.window.showInputBox({
        prompt: 'Edit your annotation',
        value: annotation.annotation
    });

    if (input !== undefined) {
        const annotationsFilePath = getAnnotationsFilePath();
        const annotations = loadAnnotations(annotationsFilePath);
        const index = annotations.findIndex(a => a.filePath === annotation.filePath && a.lineNumber === annotation.lineNumber);
        if (index !== -1) {
            annotations[index].annotation = input;
            saveAnnotations(annotations, annotationsFilePath);
            vscode.commands.executeCommand('extension.createAnnotationsView');
        }
    }
}
// Function to activate the extension
function activate(context) {
    console.log('Annotation extension is now active');

    // Command to create a new annotation
    let disposable = vscode.commands.registerCommand('extension.createAnnotation', createAnnotation);
    context.subscriptions.push(disposable);

    // Command to show all annotations in a sidebar
    disposable = vscode.commands.registerCommand('extension.showAnnotations', showAnnotations);
    context.subscriptions.push(disposable);

    // Command to edit an annotation
    disposable = vscode.commands.registerCommand('extension.editAnnotation', editAnnotation);
    context.subscriptions.push(disposable);

    // Register custom view to show annotations
    context.subscriptions.push(vscode.window.registerTreeDataProvider('annotationsView', new AnnotationsDataProvider()));
    disposable = vscode.commands.registerCommand('extension.createAnnotationsView', createAnnotationsView);
    context.subscriptions.push(disposable);

    // Register event handler for text document changes (to update decorations)
    vscode.workspace.onDidChangeTextDocument(updateDecorations);
    updateDecorations(); // Initial decorations update
}

// Function to deactivate the extension
function deactivate() {
    console.log('Annotation extension is now deactivated');
}

module.exports = {
    activate,
    deactivate
};
