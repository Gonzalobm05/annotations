const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Function to get the path for storing annotations
function getAnnotationsFilePath() {
    const workspacePath = vscode.workspace.rootPath;
    return path.join(workspacePath, '.annotations.json');
}

// Function to save annotations to a file
function saveAnnotations(annotations) {
    const filePath = getAnnotationsFilePath();
    fs.writeFileSync(filePath, JSON.stringify(annotations, null, 4), 'utf8');
}

// Function to load annotations from a file
function loadAnnotations() {
    const filePath = getAnnotationsFilePath();
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

    const annotations = loadAnnotations();
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
        const lineNumber = annotation.lineNumber - 1; // Adjust for zero-based index
        const line = activeEditor.document.lineAt(lineNumber);
        return new vscode.Range(line.range.start, line.range.end);
    });

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
        const annotations = loadAnnotations();
        annotations.push({ lineNumber, annotation: input });
        saveAnnotations(annotations);
        updateDecorations();
    }
}

// Function to show all annotations in a sidebar
function showAnnotations() {
    const annotations = loadAnnotations();
    const panel = vscode.window.createWebviewPanel(
        'annotationsPanel',
        'Annotations',
        vscode.ViewColumn.Two,
        {}
    );
    let htmlContent = '<h1>Annotations</h1>';
    annotations.forEach(annotation => {
        htmlContent += `<p>Line ${annotation.lineNumber}: ${annotation.annotation}</p>`;
    });
    panel.webview.html = htmlContent;
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
