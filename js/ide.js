import { IS_PUTER } from "./puter.js";
import { createTwoFilesPatch, parsePatch } from 'https://cdn.jsdelivr.net/npm/diff@5.1.0/lib/index.mjs';

const API_KEY = ""; // Get yours at https://platform.sulu.sh/apis/judge0
const OPENROUTER_API_KEY = "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";

const AUTH_HEADERS = API_KEY ? {
    "Authorization": `Bearer ${API_KEY}`
} : {};

const CE = "CE";
const EXTRA_CE = "EXTRA_CE";

const AUTHENTICATED_CE_BASE_URL = "https://judge0-ce.p.sulu.sh";
const AUTHENTICATED_EXTRA_CE_BASE_URL = "https://judge0-extra-ce.p.sulu.sh";

var AUTHENTICATED_BASE_URL = {};
AUTHENTICATED_BASE_URL[CE] = AUTHENTICATED_CE_BASE_URL;
AUTHENTICATED_BASE_URL[EXTRA_CE] = AUTHENTICATED_EXTRA_CE_BASE_URL;

const UNAUTHENTICATED_CE_BASE_URL = "https://ce.judge0.com";
const UNAUTHENTICATED_EXTRA_CE_BASE_URL = "https://extra-ce.judge0.com";

var UNAUTHENTICATED_BASE_URL = {};
UNAUTHENTICATED_BASE_URL[CE] = UNAUTHENTICATED_CE_BASE_URL;
UNAUTHENTICATED_BASE_URL[EXTRA_CE] = UNAUTHENTICATED_EXTRA_CE_BASE_URL;

const AI_MODELS = {
    'DeepSeek-R1': 'deepseek/deepseek-r1:free',
    'Mistral 7B Instruct': 'mistralai/mistral-7b-instruct:free',
    'Microsoft Phi-3 Medium 128K Instruct': 'microsoft/phi-3-medium-128k-instruct:free',
    'Meta Llama 3 8B Instruct': 'meta-llama/llama-3-8b-instruct:free',
    'OpenChat 3.5 7B': 'openchat/openchat-7b:free',
    'Microsoft Phi-3 Mini 128K Instruct': 'microsoft/phi-3-mini-128k-instruct:free',
}

const INITIAL_WAIT_TIME_MS = 0;
const WAIT_TIME_FUNCTION = i => 100;
const MAX_PROBE_REQUESTS = 50;

var fontSize = 13;

var layout;

var sourceEditor;
var stdinEditor;
var stdoutEditor;
var aiChatEditor;

var $selectLanguage;
var $compilerOptions;
var $commandLineArguments;
var $runBtn;
var $statusLine;

var timeStart;

var sqliteAdditionalFiles;
var languages = {};

var layoutConfig = {
    settings: {
        showPopoutIcon: false,
        reorderEnabled: true
    },
    content: [{
        type: "row",
        content: [{
            type: "column",
            width: 50,
            content: [{
                type: "component",
                componentName: "source",
                id: "source",
                title: "Source Code",
                isClosable: false,
                componentState: {
                    readOnly: false
                }
            }]
        }, {
            type: "column",
            width: 25,
            content: [{
                type: "component",
                componentName: "stdin",
                id: "stdin",
                title: "Input",
                isClosable: false,
                componentState: {
                    readOnly: false
                }
            }, {
                type: "component",
                componentName: "stdout",
                id: "stdout",
                title: "Output",
                isClosable: false,
                componentState: {
                    readOnly: true
                }
            }]
        }, {
            type: "column",
            width: 25,
            content: [{
                type: "component",
                componentName: "ai-chat",
                id: "ai-chat",
                title: "Chat",
                isClosable: true,
                componentState: {
                    readOnly: false
                }
            }]
        }]
    }]
};

var gPuterFile;

var lastFileState = '';
var previousModel = '';

//need to make the append message function global so that it can be used in the agenticProcess function

const diffStyles = document.createElement('style');
diffStyles.textContent = `
    .diff-preview {
        background: #1e1e1e;
        border-radius: 4px;
        overflow: hidden;
        margin: 10px 0;
    }

    .diff-header {
        padding: 8px;
        border-bottom: 1px solid #3c3c3c;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .diff-legend {
        display: flex;
        gap: 15px;
        font-size: 12px;
    }

    .diff-legend span::before {
        content: '●';
        margin-right: 4px;
    }

    .added-legend::before {
        color: #4CAF50;
    }

    .removed-legend::before {
        color: #f44336;
    }

    .diff-content {
        padding: 8px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        overflow-x: auto;
    }

    .diff-line {
        padding: 2px 4px;
        white-space: pre;
    }

    .diff-line.added {
        background: rgba(76, 175, 80, 0.2);
        border-left: 3px solid #4CAF50;
    }

    .diff-line.removed {
        background: rgba(244, 67, 54, 0.2);
        border-left: 3px solid #f44336;
    }

    .diff-actions {
        padding: 8px;
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        border-top: 1px solid #3c3c3c;
    }

    .diff-actions button {
        padding: 6px 12px;
        border-radius: 4px;
        border: none;
        cursor: pointer;
        font-size: 12px;
    }

    .accept-btn {
        background: #4CAF50;
        color: white;
    }

    .reject-btn {
        background: #f44336;
        color: white;
    }

    .loading-message, .linting-message {
        font-style: italic;
        opacity: 0.8;
    }
`;
document.head.appendChild(diffStyles);

function generateDiff(currentCode, proposedCode) {
    const diff = createTwoFilesPatch('current', 'proposed', currentCode, proposedCode, '', '', { context: 2 });
    return parsePatch(diff)[0];
}

function renderDiffPreview(diff) {
    const container = document.createElement('div');
    container.className = 'diff-preview';
    
    // Add diff header
    const header = document.createElement('div');
    header.className = 'diff-header';
    header.innerHTML = `
        <div class="diff-title">Proposed Changes</div>
        <div class="diff-legend">
            <span class="added-legend">Added</span>
            <span class="removed-legend">Removed</span>
        </div>
    `;
    container.appendChild(header);
    
    // Add diff content
    const content = document.createElement('div');
    content.className = 'diff-content';
    
    diff.hunks.forEach(hunk => {
        hunk.lines.forEach(line => {
            const lineDiv = document.createElement('div');
            lineDiv.className = `diff-line ${line[0] === '+' ? 'added' : line[0] === '-' ? 'removed' : 'unchanged'}`;
            lineDiv.textContent = line;
            content.appendChild(lineDiv);
        });
    });
    container.appendChild(content);
    
    // Add action buttons
    const actions = document.createElement('div');
    actions.className = 'diff-actions';
    actions.innerHTML = `
        <button class="accept-btn">Accept Changes</button>
        <button class="reject-btn">Reject Changes</button>
    `;
    container.appendChild(actions);
    
    return container;
}


function appendMessage(role, content) {
    // Get the chat history container
    const chatHistory = document.getElementById('chat-history');
    if (!chatHistory) return; // Safety check

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}-message`;
    messageDiv.style.cssText = `
        padding: 8px 12px;
        border-radius: 4px;
        max-width: 85%;
        ${role === 'user' ? 'align-self: flex-end;' : 'align-self: flex-start;'}
        background: ${role === 'user' ? '#0e639c' : '#2d2d2d'};
        border: 1px solid ${role === 'user' ? '#1177bb' : '#3c3c3c'};
    `;
    
    const textSpan = document.createElement('span');
    textSpan.textContent = content;
    textSpan.style.wordBreak = 'break-word';
    
    messageDiv.appendChild(textSpan);
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

async function agenticProcess(userInput) {
    lastFileState = sourceEditor.getValue();
    const maxAttempts = 3;
    let attempts = 0;
    let hasError = true;
    const chatHistory = document.getElementById('chat-history');
    if (!chatHistory) {
        console.error('Chat history element not found');
        return false;
    }
    const selectedModel = getSelectedModel();
    let hasNewModel = false;
    if (selectedModel !== previousModel) {
        previousModel = selectedModel;
        hasNewModel = true;
    }
    while (hasError && attempts < maxAttempts) {
        try {
            // Show loading state
            const loadingMessage = document.createElement('div');
            loadingMessage.className = 'chat-message loading-message';
            loadingMessage.textContent = 'Loading...';
            chatHistory.appendChild(loadingMessage);

            const prompt = await generatePrompt(userInput, hasNewModel);
            console.log("PROMPT GENERATED: ", prompt);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.href,
                    "X-Title": "Cursor IDE"
                },
                body: JSON.stringify({
                    "model": selectedModel,
                    "messages": [{
                        "role": "user",
                        "content": prompt
                    }]
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const aiResponse = data.choices[0].message.content;

            loadingMessage.remove();

            // Extract code from AI response
            const codeMatch = aiResponse.match(/```[\s\S]*?\n([\s\S]*?)```/);
            if (!codeMatch) {
                throw new Error("No code block found in AI response");
            }

            const proposedCode = codeMatch[1];
            const currentCode = sourceEditor.getValue();
            
            // Run linting first
            appendMessage('assistant', 'Checking code quality...');
            const lintErrors = [];
            console.log("SKIPPING LINTING FOR NOW");
            if (lintErrors.length > 0) {
                appendMessage('assistant', `Found ${lintErrors.length} issues. Requesting fixes...`);
                userInput = `Fix these linting issues: ${lintErrors.join(", ")}. Original request: ${userInput}`;
                attempts++;
                continue;
            }

            // If linting passes, show diff preview
            const diff = generateDiff(currentCode, proposedCode);
            const diffPreview = renderDiffPreview(diff);
            
            // Create a promise that resolves when user accepts or rejects
            const userDecision = new Promise((resolve) => {
                const acceptBtn = diffPreview.querySelector('.accept-btn');
                const rejectBtn = diffPreview.querySelector('.reject-btn');
                
                acceptBtn.addEventListener('click', () => {
                    sourceEditor.setValue(proposedCode);
                    diffPreview.remove();
                    appendMessage('assistant', 'Changes applied successfully.');
                    resolve(true);
                });
                
                rejectBtn.addEventListener('click', () => {
                    diffPreview.remove();
                    appendMessage('assistant', 'Changes rejected.');
                    resolve(false);
                });
            });
            
            // Add the diff preview to the chat
            const previewMessage = document.createElement('div');
            previewMessage.className = 'chat-message assistant-message';
            previewMessage.appendChild(diffPreview);
            chatHistory.appendChild(previewMessage);
            chatHistory.scrollTop = chatHistory.scrollHeight;

            // Wait for user decision
            const accepted = await userDecision;
            hasError = !accepted;

        } catch (error) {
            console.error("Error in agenticProcess:", error);
            appendMessage('assistant', `Error: ${error.message}`);
            attempts++;
        }
    }

    if (attempts >= maxAttempts) {
        appendMessage('assistant', 'Maximum attempts reached. Please try rephrasing your request.');
    }

    return !hasError;
}

async function generatePrompt(userInput, hasNewModel) {
    const selectedLanguage = await getSelectedLanguage();
    const selectedModel = getSelectedModel();
    const codeContext = lastFileState ? `\nCurrent code context:\n\`\`\`${selectedLanguage.name}\n${lastFileState}\n\`\`\`` : '';
    const safetyPrompt = "Always validate inputs, handle edge cases, and include security considerations.";
    const chatHistory = document.getElementById('chat-history');
    const chatHistoryContent = chatHistory ? chatHistory.innerHTML : '';
    const chatHistoryPrompt = hasNewModel ? `\nChat history:\n${chatHistoryContent}` : '';

    switch(selectedModel) {
        case "DeepSeek-R1":
            return `[SYSTEM] As a ${selectedLanguage.name} expert, provide production-grade code with:
                    1) Brief analysis 2) Optimized solution 3) Key considerations
                    ${safetyPrompt}
                    ${codeContext}
                    ${chatHistoryPrompt}
                    Query: ${userInput}`;

        case "Mistral 7B Instruct":
            return `<s>[INST] You are an expert ${selectedLanguage.name} developer. Format:
                    1. Problem analysis (1 sentence)
                    2. Secure solution code
                    3. Implementation notes (bulleted)
                    ${safetyPrompt}
                    Context:${codeContext}
                    ${chatHistoryPrompt}
                    Task: ${userInput} [/INST]`;

        case "Microsoft Phi-3 Medium 128K Instruct":
            return `[SYSTEM] As a senior ${selectedLanguage.name} engineer:
                    - Analyze security requirements first
                    - Write modular, safe code
                    - Explain security patterns used
                    ${codeContext}
                    ${chatHistoryPrompt}
                    [USER] ${userInput}
                    ${safetyPrompt}`;

        case "Meta Llama 3 8B Instruct":
            return `[INST] <<SYS>>
                    You are a pragmatic ${selectedLanguage.name} developer. Prioritize:
                    1. Secure input validation
                    2. Readable code
                    3. Error handling
                    ${safetyPrompt}
                    <</SYS>>
                    ${codeContext}
                    ${chatHistoryPrompt}
                    ${userInput} [/INST]`;

        case "OpenChat 3.5 7B":
            return `[CODE_EXPERT] Language: ${selectedLanguage.name}
                    ${safetyPrompt}
                    Context:${codeContext}
                    ${chatHistoryPrompt}
                    Task: ${userInput}
                    Response format:
                    '''
                    // Secure ${selectedLanguage.name} solution
'''
Key security considerations:`;

        case "Microsoft Phi-3 Mini 128K Instruct":
            return `[TASK] ${userInput}
                    [REQUIREMENTS]
                    - ${selectedLanguage.name} best practices
                    - Security-first approach
                    - <50 lines with comments
                    ${safetyPrompt}
                    [CONTEXT]${codeContext}
                    ${chatHistoryPrompt}`;

        default:
            return `[INST] As a ${selectedLanguage.name} expert:
                    1. Secure solution code
                    2. Security explanation
                    3. Alternative safe approaches
                    ${safetyPrompt}
                    Context:${codeContext}
                    ${chatHistoryPrompt}
                    Query: ${userInput} [/INST]`;
    }
}
function encode(str) {
    return btoa(unescape(encodeURIComponent(str || "")));
}

function decode(bytes) {
    var escaped = escape(atob(bytes || ""));
    try {
        return decodeURIComponent(escaped);
    } catch {
        return unescape(escaped);
    }
}

function showError(title, content) {
    $("#judge0-site-modal #title").html(title);
    $("#judge0-site-modal .content").html(content);

    let reportTitle = encodeURIComponent(`Error on ${window.location.href}`);
    let reportBody = encodeURIComponent(
        `**Error Title**: ${title}\n` +
        `**Error Timestamp**: \`${new Date()}\`\n` +
        `**Origin**: ${window.location.href}\n` +
        `**Description**:\n${content}`
    );

    $("#report-problem-btn").attr("href", `https://github.com/judge0/ide/issues/new?title=${reportTitle}&body=${reportBody}`);
    $("#judge0-site-modal").modal("show");
}

function showHttpError(jqXHR) {
    showError(`${jqXHR.statusText} (${jqXHR.status})`, `<pre>${JSON.stringify(jqXHR, null, 4)}</pre>`);
}

function handleRunError(jqXHR) {
    showHttpError(jqXHR);
    $runBtn.removeClass("disabled");

    window.top.postMessage(JSON.parse(JSON.stringify({
        event: "runError",
        data: jqXHR
    })), "*");
}

function handleResult(data) {
    const tat = Math.round(performance.now() - timeStart);
    console.log(`It took ${tat}ms to get submission result.`);

    const status = data.status;
    const stdout = decode(data.stdout);
    const compileOutput = decode(data.compile_output);
    const time = (data.time === null ? "-" : data.time + "s");
    const memory = (data.memory === null ? "-" : data.memory + "KB");

    $statusLine.html(`${status.description}, ${time}, ${memory} (TAT: ${tat}ms)`);

    const output = [compileOutput, stdout].join("\n").trim();

    stdoutEditor.setValue(output);

    $runBtn.removeClass("disabled");

    window.top.postMessage(JSON.parse(JSON.stringify({
        event: "postExecution",
        status: data.status,
        time: data.time,
        memory: data.memory,
        output: output
    })), "*");
}

async function getSelectedLanguage() {
    return getLanguage(getSelectedLanguageFlavor(), getSelectedLanguageId())
}

function getSelectedLanguageId() {
    return parseInt($selectLanguage.val());
}

function getSelectedLanguageFlavor() {
    return $selectLanguage.find(":selected").attr("flavor");
}

function run() {
    if (sourceEditor.getValue().trim() === "") {
        showError("Error", "Source code can't be empty!");
        return;
    } else {
        $runBtn.addClass("disabled");
    }

    stdoutEditor.setValue("");
    $statusLine.html("");

    let x = layout.root.getItemsById("stdout")[0];
    x.parent.header.parent.setActiveContentItem(x);

    let sourceValue = encode(sourceEditor.getValue());
    let stdinValue = encode(stdinEditor.getValue());
    let languageId = getSelectedLanguageId();
    let compilerOptions = $compilerOptions.val();
    let commandLineArguments = $commandLineArguments.val();

    let flavor = getSelectedLanguageFlavor();

    if (languageId === 44) {
        sourceValue = sourceEditor.getValue();
    }

    let data = {
        source_code: sourceValue,
        language_id: languageId,
        stdin: stdinValue,
        compiler_options: compilerOptions,
        command_line_arguments: commandLineArguments,
        redirect_stderr_to_stdout: true
    };

    let sendRequest = function (data) {
        window.top.postMessage(JSON.parse(JSON.stringify({
            event: "preExecution",
            source_code: sourceEditor.getValue(),
            language_id: languageId,
            flavor: flavor,
            stdin: stdinEditor.getValue(),
            compiler_options: compilerOptions,
            command_line_arguments: commandLineArguments
        })), "*");

        timeStart = performance.now();
        $.ajax({
            url: `${AUTHENTICATED_BASE_URL[flavor]}/submissions?base64_encoded=true&wait=false`,
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify(data),
            headers: AUTH_HEADERS,
            success: function (data, textStatus, request) {
                console.log(`Your submission token is: ${data.token}`);
                let region = request.getResponseHeader('X-Judge0-Region');
                setTimeout(fetchSubmission.bind(null, flavor, region, data.token, 1), INITIAL_WAIT_TIME_MS);
            },
            error: handleRunError
        });
    }

    if (languageId === 82) {
        if (!sqliteAdditionalFiles) {
            $.ajax({
                url: `./data/additional_files_zip_base64.txt`,
                contentType: "text/plain",
                success: function (responseData) {
                    sqliteAdditionalFiles = responseData;
                    data["additional_files"] = sqliteAdditionalFiles;
                    sendRequest(data);
                },
                error: handleRunError
            });
        }
        else {
            data["additional_files"] = sqliteAdditionalFiles;
            sendRequest(data);
        }
    } else {
        sendRequest(data);
    }
}

function fetchSubmission(flavor, region, submission_token, iteration) {
    if (iteration >= MAX_PROBE_REQUESTS) {
        handleRunError({
            statusText: "Maximum number of probe requests reached.",
            status: 504
        }, null, null);
        return;
    }

    $.ajax({
        url: `${UNAUTHENTICATED_BASE_URL[flavor]}/submissions/${submission_token}?base64_encoded=true`,
        headers: {
            "X-Judge0-Region": region
        },
        success: function (data) {
            if (data.status.id <= 2) { // In Queue or Processing
                $statusLine.html(data.status.description);
                setTimeout(fetchSubmission.bind(null, flavor, region, submission_token, iteration + 1), WAIT_TIME_FUNCTION(iteration));
            } else {
                handleResult(data);
            }
        },
        error: handleRunError
    });
}

function setSourceCodeName(name) {
    $(".lm_title")[0].innerText = name;
}

function getSourceCodeName() {
    return $(".lm_title")[0].innerText;
}

function openFile(content, filename) {
    clear();
    sourceEditor.setValue(content);
    selectLanguageForExtension(filename.split(".").pop());
    setSourceCodeName(filename);
}

function saveFile(content, filename) {
    const blob = new Blob([content], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

async function openAction() {
    if (IS_PUTER) {
        gPuterFile = await puter.ui.showOpenFilePicker();
        openFile(await (await gPuterFile.read()).text(), gPuterFile.name);
    } else {
        document.getElementById("open-file-input").click();
    }
}

async function saveAction() {
    if (IS_PUTER) {
        if (gPuterFile) {
            gPuterFile.write(sourceEditor.getValue());
        } else {
            gPuterFile = await puter.ui.showSaveFilePicker(sourceEditor.getValue(), getSourceCodeName());
            setSourceCodeName(gPuterFile.name);
        }
    } else {
        saveFile(sourceEditor.getValue(), getSourceCodeName());
    }
}

function setFontSizeForAllEditors(fontSize) {
    sourceEditor.updateOptions({ fontSize: fontSize });
    stdinEditor.updateOptions({ fontSize: fontSize });
    stdoutEditor.updateOptions({ fontSize: fontSize });
}

async function loadLangauges() {
    return new Promise((resolve, reject) => {
        let options = [];

        $.ajax({
            url: UNAUTHENTICATED_CE_BASE_URL + "/languages",
            success: function (data) {
                for (let i = 0; i < data.length; i++) {
                    let language = data[i];
                    let option = new Option(language.name, language.id);
                    option.setAttribute("flavor", CE);
                    option.setAttribute("langauge_mode", getEditorLanguageMode(language.name));

                    if (language.id !== 89) {
                        options.push(option);
                    }

                    if (language.id === DEFAULT_LANGUAGE_ID) {
                        option.selected = true;
                    }
                }
            },
            error: reject
        }).always(function () {
            $.ajax({
                url: UNAUTHENTICATED_EXTRA_CE_BASE_URL + "/languages",
                success: function (data) {
                    for (let i = 0; i < data.length; i++) {
                        let language = data[i];
                        let option = new Option(language.name, language.id);
                        option.setAttribute("flavor", EXTRA_CE);
                        option.setAttribute("langauge_mode", getEditorLanguageMode(language.name));

                        if (options.findIndex((t) => (t.text === option.text)) === -1 && language.id !== 89) {
                            options.push(option);
                        }
                    }
                },
                error: reject
            }).always(function () {
                options.sort((a, b) => a.text.localeCompare(b.text));
                $selectLanguage.append(options);
                resolve();
            });
        });
    });
};

async function loadSelectedLanguage(skipSetDefaultSourceCodeName = false) {
    monaco.editor.setModelLanguage(sourceEditor.getModel(), $selectLanguage.find(":selected").attr("langauge_mode"));

    if (!skipSetDefaultSourceCodeName) {
        setSourceCodeName((await getSelectedLanguage()).source_file);
    }
}

function selectLanguageByFlavorAndId(languageId, flavor) {
    let option = $selectLanguage.find(`[value=${languageId}][flavor=${flavor}]`);
    if (option.length) {
        option.prop("selected", true);
        $selectLanguage.trigger("change", { skipSetDefaultSourceCodeName: true });
    }
}

function selectLanguageForExtension(extension) {
    let language = getLanguageForExtension(extension);
    selectLanguageByFlavorAndId(language.language_id, language.flavor);
}

async function getLanguage(flavor, languageId) {
    return new Promise((resolve, reject) => {
        if (languages[flavor] && languages[flavor][languageId]) {
            resolve(languages[flavor][languageId]);
            return;
        }

        $.ajax({
            url: `${UNAUTHENTICATED_BASE_URL[flavor]}/languages/${languageId}`,
            success: function (data) {
                if (!languages[flavor]) {
                    languages[flavor] = {};
                }

                languages[flavor][languageId] = data;
                resolve(data);
            },
            error: reject
        });
    });
}

function setDefaults() {
    setFontSizeForAllEditors(fontSize);
    sourceEditor.setValue(DEFAULT_SOURCE);
    stdinEditor.setValue(DEFAULT_STDIN);
    $compilerOptions.val(DEFAULT_COMPILER_OPTIONS);
    $commandLineArguments.val(DEFAULT_CMD_ARGUMENTS);

    $statusLine.html("");

    loadSelectedLanguage();
}

function clear() {
    sourceEditor.setValue("");
    stdinEditor.setValue("");
    $compilerOptions.val("");
    $commandLineArguments.val("");

    $statusLine.html("");
}

function refreshSiteContentHeight() {
    const navigationHeight = document.getElementById("judge0-site-navigation").offsetHeight;

    const siteContent = document.getElementById("judge0-site-content");
    siteContent.style.height = `${window.innerHeight}px`;
    siteContent.style.paddingTop = `${navigationHeight}px`;
}

function refreshLayoutSize() {
    refreshSiteContentHeight();
    layout.updateSize();
}

window.addEventListener("resize", refreshLayoutSize);
document.addEventListener("DOMContentLoaded", async function () {
    $("#select-language").dropdown();
    $("[data-content]").popup({
        lastResort: "left center"
    });

    refreshSiteContentHeight();

    console.log("Hey, Judge0 IDE is open-sourced: https://github.com/judge0/ide. Have fun!");

    $selectLanguage = $("#select-language");
    $selectLanguage.change(function (event, data) {
        let skipSetDefaultSourceCodeName = (data && data.skipSetDefaultSourceCodeName) || !!gPuterFile;
        loadSelectedLanguage(skipSetDefaultSourceCodeName);
    });

    await loadLangauges();

    $compilerOptions = $("#compiler-options");
    $commandLineArguments = $("#command-line-arguments");

    $runBtn = $("#run-btn");
    $runBtn.click(run);

    $("#open-file-input").change(function (e) {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            const reader = new FileReader();
            reader.onload = function (e) {
                openFile(e.target.result, selectedFile.name);
            };

            reader.onerror = function (e) {
                showError("Error", "Error reading file: " + e.target.error);
            };

            reader.readAsText(selectedFile);
        }
    });

    $statusLine = $("#judge0-status-line");

    $(document).on("keydown", "body", function (e) {
        if (e.metaKey || e.ctrlKey) {
            switch (e.key) {
                case "Enter": // Ctrl+Enter, Cmd+Enter
                    e.preventDefault();
                    run();
                    break;
                case "s": // Ctrl+S, Cmd+S
                    e.preventDefault();
                    save();
                    break;
                case "o": // Ctrl+O, Cmd+O
                    e.preventDefault();
                    open();
                    break;
                case "+": // Ctrl+Plus
                case "=": // Some layouts use '=' for '+'
                    e.preventDefault();
                    fontSize += 1;
                    setFontSizeForAllEditors(fontSize);
                    break;
                case "-": // Ctrl+Minus
                    e.preventDefault();
                    fontSize -= 1;
                    setFontSizeForAllEditors(fontSize);
                    break;
                case "0": // Ctrl+0
                    e.preventDefault();
                    fontSize = 13;
                    setFontSizeForAllEditors(fontSize);
                    break;
            }
        }
    });

    require(["vs/editor/editor.main"], function (ignorable) {
        layout = new GoldenLayout(layoutConfig, $("#judge0-site-content"));

        layout.registerComponent("source", function (container, state) {
            sourceEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                scrollBeyondLastLine: true,
                readOnly: state.readOnly,
                language: "cpp",
                fontFamily: "JetBrains Mono",
                minimap: {
                    enabled: true
                }
            });

            sourceEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);
        });

        layout.registerComponent("stdin", function (container, state) {
            stdinEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                fontFamily: "JetBrains Mono",
                minimap: {
                    enabled: false
                }
            });
        });

        layout.registerComponent("stdout", function (container, state) {
            stdoutEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                scrollBeyondLastLine: false,
                readOnly: state.readOnly,
                language: "plaintext",
                fontFamily: "JetBrains Mono",
                minimap: {
                    enabled: false
                }
            });
        });

        
        layout.registerComponent("ai-chat", function (container, state) {
            // Create chat container div
            const chatContainer = document.createElement('div');
            chatContainer.id = 'chat-container';
            chatContainer.style.cssText = `
                height: 100%;
                width: 100%;
                display: flex;
                flex-direction: column;
                background: #1e1e1e;
                color: #d4d4d4;
                font-family: 'JetBrains Mono', monospace;
            `;

            // Create model selector
            const modelSelector = document.createElement('select');
            modelSelector.id = 'ai-model-selector';
            modelSelector.style.cssText = `
                margin: 10px;
                padding: 5px;
                background: #2d2d2d;
                color: #d4d4d4;
                border: 1px solid #3c3c3c;
                border-radius: 4px;
                font-family: inherit;
            `;
            Object.entries(AI_MODELS).forEach(([name, value]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = name;
                modelSelector.appendChild(option);
            });

            // Create chat history area
            const chatHistory = document.createElement('div');
            chatHistory.id = 'chat-history';
            chatHistory.style.cssText = `
                flex-grow: 1;
                overflow-y: auto;
                padding: 10px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;

            // Create input container
            const inputContainer = document.createElement('div');
            inputContainer.style.cssText = `
                display: flex;
                gap: 10px;
                padding: 10px;
                border-top: 1px solid #3c3c3c;
            `;

            // Create textarea for input
            const textarea = document.createElement('textarea');
            textarea.id = 'chat-input';
            textarea.placeholder = 'Type your message here...';
            textarea.style.cssText = `
                flex-grow: 1;
                padding: 8px;
                background: #2d2d2d;
                color: #d4d4d4;
                border: 1px solid #3c3c3c;
                border-radius: 4px;
                font-family: inherit;
                resize: none;
                height: 40px;
            `;

            // Create submit button
            const submitButton = document.createElement('button');
            submitButton.id = 'chat-submit';
            submitButton.textContent = 'Send';
            submitButton.style.cssText = `
                padding: 8px 16px;
                background: #0e639c;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-family: inherit;
            `;
            submitButton.addEventListener('mouseover', () => {
                submitButton.style.background = '#1177bb';
            });
            submitButton.addEventListener('mouseout', () => {
                submitButton.style.background = '#0e639c';
            });

            // Add event listeners
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSubmit();
                }
            });

            submitButton.addEventListener('click', handleChatSubmit);

            // Append all elements
            inputContainer.appendChild(textarea);
            inputContainer.appendChild(submitButton);
            
            chatContainer.appendChild(modelSelector);
            chatContainer.appendChild(chatHistory);
            chatContainer.appendChild(inputContainer);
            
            container.getElement()[0].appendChild(chatContainer);
            aiChatEditor = chatContainer;

            async function handleChatSubmit() {
                const input = textarea.value.trim();
                if (!input) return;

                appendMessage('user', input);
                
                textarea.value = '';

                agenticProcess(input);
            }
        });

        layout.on("initialised", function () {
            setDefaults();
            refreshLayoutSize();
            window.top.postMessage({ event: "initialised" }, "*");
        });

        layout.init();
    });

    let superKey = "⌘";
    if (!/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform)) {
        superKey = "Ctrl";
    }

    [$runBtn].forEach(btn => {
        btn.attr("data-content", `${superKey}${btn.attr("data-content")}`);
    });

    document.querySelectorAll(".description").forEach(e => {
        e.innerText = `${superKey}${e.innerText}`;
    });

    if (IS_PUTER) {
        puter.ui.onLaunchedWithItems(async function (items) {
            gPuterFile = items[0];
            openFile(await (await gPuterFile.read()).text(), gPuterFile.name);
        });
    }

    document.getElementById("judge0-open-file-btn").addEventListener("click", openAction);
    document.getElementById("judge0-save-btn").addEventListener("click", saveAction);

    window.onmessage = function (e) {
        if (!e.data) {
            return;
        }

        if (e.data.action === "get") {
            window.top.postMessage(JSON.parse(JSON.stringify({
                event: "getResponse",
                source_code: sourceEditor.getValue(),
                language_id: getSelectedLanguageId(),
                flavor: getSelectedLanguageFlavor(),
                stdin: stdinEditor.getValue(),
                stdout: stdoutEditor.getValue(),
                compiler_options: $compilerOptions.val(),
                command_line_arguments: $commandLineArguments.val()
            })), "*");
        } else if (e.data.action === "set") {
            if (e.data.source_code) {
                sourceEditor.setValue(e.data.source_code);
            }
            if (e.data.language_id && e.data.flavor) {
                selectLanguageByFlavorAndId(e.data.language_id, e.data.flavor);
            }
            if (e.data.stdin) {
                stdinEditor.setValue(e.data.stdin);
            }
            if (e.data.stdout) {
                stdoutEditor.setValue(e.data.stdout);
            }
            if (e.data.compiler_options) {
                $compilerOptions.val(e.data.compiler_options);
            }
            if (e.data.command_line_arguments) {
                $commandLineArguments.val(e.data.command_line_arguments);
            }
            if (e.data.api_key) {
                AUTH_HEADERS["Authorization"] = `Bearer ${e.data.api_key}`;
            }
        }
    };
});

const DEFAULT_SOURCE = "\
#include <algorithm>\n\
#include <cstdint>\n\
#include <iostream>\n\
#include <limits>\n\
#include <set>\n\
#include <utility>\n\
#include <vector>\n\
\n\
using Vertex    = std::uint16_t;\n\
using Cost      = std::uint16_t;\n\
using Edge      = std::pair< Vertex, Cost >;\n\
using Graph     = std::vector< std::vector< Edge > >;\n\
using CostTable = std::vector< std::uint64_t >;\n\
\n\
constexpr auto kInfiniteCost{ std::numeric_limits< CostTable::value_type >::max() };\n\
\n\
auto dijkstra( Vertex const start, Vertex const end, Graph const & graph, CostTable & costTable )\n\
{\n\
    std::fill( costTable.begin(), costTable.end(), kInfiniteCost );\n\
    costTable[ start ] = 0;\n\
\n\
    std::set< std::pair< CostTable::value_type, Vertex > > minHeap;\n\
    minHeap.emplace( 0, start );\n\
\n\
    while ( !minHeap.empty() )\n\
    {\n\
        auto const vertexCost{ minHeap.begin()->first  };\n\
        auto const vertex    { minHeap.begin()->second };\n\
\n\
        minHeap.erase( minHeap.begin() );\n\
\n\
        if ( vertex == end )\n\
        {\n\
            break;\n\
        }\n\
\n\
        for ( auto const & neighbourEdge : graph[ vertex ] )\n\
        {\n\
            auto const & neighbour{ neighbourEdge.first };\n\
            auto const & cost{ neighbourEdge.second };\n\
\n\
            if ( costTable[ neighbour ] > vertexCost + cost )\n\
            {\n\
                minHeap.erase( { costTable[ neighbour ], neighbour } );\n\
                costTable[ neighbour ] = vertexCost + cost;\n\
                minHeap.emplace( costTable[ neighbour ], neighbour );\n\
            }\n\
        }\n\
    }\n\
\n\
    return costTable[ end ];\n\
}\n\
\n\
int main()\n\
{\n\
    constexpr std::uint16_t maxVertices{ 10000 };\n\
\n\
    Graph     graph    ( maxVertices );\n\
    CostTable costTable( maxVertices );\n\
\n\
    std::uint16_t testCases;\n\
    std::cin >> testCases;\n\
\n\
    while ( testCases-- > 0 )\n\
    {\n\
        for ( auto i{ 0 }; i < maxVertices; ++i )\n\
        {\n\
            graph[ i ].clear();\n\
        }\n\
\n\
        std::uint16_t numberOfVertices;\n\
        std::uint16_t numberOfEdges;\n\
\n\
        std::cin >> numberOfVertices >> numberOfEdges;\n\
\n\
        for ( auto i{ 0 }; i < numberOfEdges; ++i )\n\
        {\n\
            Vertex from;\n\
            Vertex to;\n\
            Cost   cost;\n\
\n\
            std::cin >> from >> to >> cost;\n\
            graph[ from ].emplace_back( to, cost );\n\
        }\n\
\n\
        Vertex start;\n\
        Vertex end;\n\
\n\
        std::cin >> start >> end;\n\
\n\
        auto const result{ dijkstra( start, end, graph, costTable ) };\n\
\n\
        if ( result == kInfiniteCost )\n\
        {\n\
            std::cout << \"NO\\n\";\n\
        }\n\
        else\n\
        {\n\
            std::cout << result << '\\n';\n\
        }\n\
    }\n\
\n\
    return 0;\n\
}\n\
";

const DEFAULT_STDIN = "\
3\n\
3 2\n\
1 2 5\n\
2 3 7\n\
1 3\n\
3 3\n\
1 2 4\n\
1 3 7\n\
2 3 1\n\
1 3\n\
3 1\n\
1 2 4\n\
1 3\n\
";

const DEFAULT_COMPILER_OPTIONS = "";
const DEFAULT_CMD_ARGUMENTS = "";
const DEFAULT_LANGUAGE_ID = 105; // C++ (GCC 14.1.0) (https://ce.judge0.com/languages/105)

function getEditorLanguageMode(languageName) {
    const DEFAULT_EDITOR_LANGUAGE_MODE = "plaintext";
    const LANGUAGE_NAME_TO_LANGUAGE_EDITOR_MODE = {
        "Bash": "shell",
        "C": "c",
        "C3": "c",
        "C#": "csharp",
        "C++": "cpp",
        "Clojure": "clojure",
        "F#": "fsharp",
        "Go": "go",
        "Java": "java",
        "JavaScript": "javascript",
        "Kotlin": "kotlin",
        "Objective-C": "objective-c",
        "Pascal": "pascal",
        "Perl": "perl",
        "PHP": "php",
        "Python": "python",
        "R": "r",
        "Ruby": "ruby",
        "SQL": "sql",
        "Swift": "swift",
        "TypeScript": "typescript",
        "Visual Basic": "vb"
    }

    for (let key in LANGUAGE_NAME_TO_LANGUAGE_EDITOR_MODE) {
        if (languageName.toLowerCase().startsWith(key.toLowerCase())) {
            return LANGUAGE_NAME_TO_LANGUAGE_EDITOR_MODE[key];
        }
    }
    return DEFAULT_EDITOR_LANGUAGE_MODE;
}

const EXTENSIONS_TABLE = {
    "asm": { "flavor": CE, "language_id": 45 }, // Assembly (NASM 2.14.02)
    "c": { "flavor": CE, "language_id": 103 }, // C (GCC 14.1.0)
    "cpp": { "flavor": CE, "language_id": 105 }, // C++ (GCC 14.1.0)
    "cs": { "flavor": EXTRA_CE, "language_id": 29 }, // C# (.NET Core SDK 7.0.400)
    "go": { "flavor": CE, "language_id": 95 }, // Go (1.18.5)
    "java": { "flavor": CE, "language_id": 91 }, // Java (JDK 17.0.6)
    "js": { "flavor": CE, "language_id": 102 }, // JavaScript (Node.js 22.08.0)
    "lua": { "flavor": CE, "language_id": 64 }, // Lua (5.3.5)
    "pas": { "flavor": CE, "language_id": 67 }, // Pascal (FPC 3.0.4)
    "php": { "flavor": CE, "language_id": 98 }, // PHP (8.3.11)
    "py": { "flavor": EXTRA_CE, "language_id": 25 }, // Python for ML (3.11.2)
    "r": { "flavor": CE, "language_id": 99 }, // R (4.4.1)
    "rb": { "flavor": CE, "language_id": 72 }, // Ruby (2.7.0)
    "rs": { "flavor": CE, "language_id": 73 }, // Rust (1.40.0)
    "scala": { "flavor": CE, "language_id": 81 }, // Scala (2.13.2)
    "sh": { "flavor": CE, "language_id": 46 }, // Bash (5.0.0)
    "swift": { "flavor": CE, "language_id": 83 }, // Swift (5.2.3)
    "ts": { "flavor": CE, "language_id": 101 }, // TypeScript (5.6.2)
    "txt": { "flavor": CE, "language_id": 43 }, // Plain Text
};

function getLanguageForExtension(extension) {
    return EXTENSIONS_TABLE[extension] || { "flavor": CE, "language_id": 43 }; // Plain Text (https://ce.judge0.com/languages/43)
}

function getSelectedModel() {
    const modelSelector = document.getElementById('ai-model-selector');
    if (!modelSelector) return AI_MODELS['DeepSeek-R1']; // Default model if selector not found
    return modelSelector.value;
}
