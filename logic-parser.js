// =========================================================================
// COMPLETELY REPAIRED LOGIC-PARSER.JS (STABLE FOR CALCULATOR & TASKS)
// =========================================================================

// Hauptfunktion für den Parser
function parseFormula(formulaString) {
    let tokens = tokenize(formulaString);
    let rpn = shuntingYard(tokens);
    let root = buildTree(rpn);
    
    // Gibt ein voll kompatibles Ergebnisobjekt für den Rechner UND die Aufgaben zurück
    return {
        root: root,
        // Fallback für den Rechner-Tab, falls dieser .fullyBracketed erwartet:
        fullyBracketed: root.toBracketedString ? root.toBracketedString() : root.toHtml(),
        subFormulas: getSubFormulasForNode(root).map(n => n.toHtml())
    };
}

// Zerlegt den String in Einzelteile (Tokens)
function tokenize(str) {
    let result = [];
    let i = 0;
    while (i < str.length) {
        let char = str[i];
        if (/\s/.test(char)) { i++; continue; }
        if (/[a-zA-Z]/.test(char)) { result.push({ type: 'VAR', val: char }); i++; continue; }
        if (char === '!' || char === '∧' || char === '∨' || char === '(' || char === ')') {
            result.push({ type: char === '!' ? '!' : 'OP', val: char });
            i++;
            continue;
        }
        i++;
    }
    return result;
}

// Shunting-Yard-Algorithmus für mathematische Prioritäten
function shuntingYard(tokens) {
    let outputQueue = [];
    let operatorStack = [];
    let prec = { '!': 3, '∧': 2, '∨': 1 };

    tokens.forEach(token => {
        if (token.type === 'VAR') {
            outputQueue.push(token);
        } else if (token.val === '(') {
            operatorStack.push(token);
        } else if (token.val === ')') {
            while (operatorStack.length && operatorStack[operatorStack.length - 1].val !== '(') {
                outputQueue.push(operatorStack.pop());
            }
            operatorStack.pop();
        } else {
            while (operatorStack.length && operatorStack[operatorStack.length - 1].val !== '(' &&
                   prec[operatorStack[operatorStack.length - 1].val] >= prec[token.val]) {
                outputQueue.push(operatorStack.pop());
            }
            operatorStack.push(token);
        }
    });
    while (operatorStack.length) {
        outputQueue.push(operatorStack.pop());
    }
    return outputQueue;
}

// Baut den Baum aus der Postfix-Notation (RPN)
function buildTree(rpn) {
    let queue = [];
    rpn.forEach(token => {
        if (token.type === 'VAR') {
            queue.push({
                type: 'VAR',
                val: token.val,
                evaluate: (env) => env[token.val],
                toBracketedString: () => token.val,
                toHtml: () => token.val
            });
        } else {
            buildTreeNodes(token, queue);
        }
    });
    return queue[0];
}

// Erzeugt die Knoten und bindet alle notwendigen Text-, HTML- und Berechnungs-Methoden
function buildTreeNodes(operator, queue) {
    if (operator.val === '!') {
        let operand = queue.pop();
        if (!operand) throw new Error("Fehlendes Element für Negation.");
        queue.push({
            type: 'OP',
            val: '!',
            child: operand,
            evaluate: (env) => !operand.evaluate(env),
            toBracketedString: () => operand.type === 'VAR' ? `!${operand.toBracketedString()}` : `!(${operand.toBracketedString()})`,
            toHtml: () => `<span class="not">${operand.toHtml()}</span>`
        });
    } else {
        let right = queue.pop();
        let left = queue.pop();
        if (!left || !right) throw new Error("Fehlendes Element für Verknüpfung.");
        queue.push({
            type: 'OP',
            val: operator.val,
            left: left,
            right: right,
            evaluate: (env) => operator.val === '∧' ? left.evaluate(env) && right.evaluate(env) : left.evaluate(env) || right.evaluate(env),
            toBracketedString: () => `(${left.toBracketedString()} ${operator.val} ${right.toBracketedString()})`,
            // KORREKTUR: Wir prüfen, ob das Kind ein normaler Operator ODER eine Negation über einem Operator ist
            toHtml: () => {
                let brauchtKlammerLinks = (left.type === 'OP' && left.val !== '!') || 
                                          (left.type === 'OP' && left.val === '!' && left.child && left.child.type === 'OP');
                let brauchtKlammerRechts = (right.type === 'OP' && right.val !== '!') || 
                                           (right.type === 'OP' && right.val === '!' && right.child && right.child.type === 'OP');
                
                let lStr = brauchtKlammerLinks ? `(${left.toHtml()})` : left.toHtml();
                let rStr = brauchtKlammerRechts ? `(${right.toHtml()})` : right.toHtml();
                return `${lStr} ${operator.val} ${rStr}`;
            }
        });
    }
}

// Klont einen Baum tiefenrein, um gegenseitige Beeinflussung AUSZUSCHLIESSEN
function cloneTree(node) {
    if (!node) return null;
    let clone = {
        type: node.type,
        val: node.val,
        evaluate: node.evaluate,
        toBracketedString: node.toBracketedString,
        toHtml: node.toHtml
    };
    if (node.child) clone.child = cloneTree(node.child);
    if (node.left) clone.left = cloneTree(node.left);
    if (node.right) clone.right = cloneTree(node.right);
    return clone;
}

// Führt DeMorgan und die doppelte Negationskürzung auf einem isolierten Klon aus
function applyDeMorganToTree(node) {
    if (!node) return null;

    // REGEL 1: Doppelte Negation direkt aufheben (!!x -> x)
    if (node.type === 'OP' && node.val === '!' && node.child && node.child.type === 'OP' && node.child.val === '!') {
        return applyDeMorganToTree(node.child.child);
    }

    // REGEL 2: DeMorgan anwenden, wenn ein ! direkt über einem ∧ oder ∨ steht
    if (node.type === 'OP' && node.val === '!' && node.child && node.child.type === 'OP' && node.child.val !== '!') {
        let innerOp = node.child;
        let targetOpSymbol = innerOp.val === '∧' ? '∨' : '∧';
        
        // Die Kinder invertieren und rekursiv weiterverarbeiten (wichtig für eventuelle !!-Kürzungen darunter!)
        let leftInverted = { type: 'OP', val: '!', child: applyDeMorganToTree(innerOp.left) };
        let rightInverted = { type: 'OP', val: '!', child: applyDeMorganToTree(innerOp.right) };
        
        // Methoden für die neuen Invertierungs-Knoten isoliert binden
        [leftInverted, rightInverted].forEach(n => {
            // Falls sich das Kind durch die Rekursion als doppelte Negation entpuppt hat, direkt kürzen
            if (n.child.type === 'OP' && n.child.val === '!' && n.child.child) {
                let extrakt = n.child.child;
                n.type = extrakt.type;
                n.val = extrakt.val;
                n.left = extrakt.left; n.right = extrakt.right; n.child = extrakt.child;
                n.evaluate = extrakt.evaluate; n.toHtml = extrakt.toHtml;
            } else {
                n.evaluate = (env) => !n.child.evaluate(env);
                n.toHtml = () => `<span class="not">${n.child.toHtml()}</span>`;
            }
        });
        
        let dmNode = {
            type: 'OP',
            val: targetOpSymbol,
            left: leftInverted,
            right: rightInverted,
            evaluate: (env) => targetOpSymbol === '∧' ? leftInverted.evaluate(env) && rightInverted.evaluate(env) : leftInverted.evaluate(env) || rightInverted.evaluate(env)
        };
        
        dmNode.toHtml = () => {
            let brauchtKlammerLinks = (dmNode.left.type === 'OP' && dmNode.left.val !== '!') || 
                                      (dmNode.left.type === 'OP' && dmNode.left.val === '!' && dmNode.left.child && dmNode.left.child.type === 'OP');
            let brauchtKlammerRechts = (dmNode.right.type === 'OP' && dmNode.right.val !== '!') || 
                                       (dmNode.right.type === 'OP' && dmNode.right.val === '!' && dmNode.right.child && dmNode.right.child.type === 'OP');
            let lStr = brauchtKlammerLinks ? `(${dmNode.left.toHtml()})` : dmNode.left.toHtml();
            let rStr = brauchtKlammerRechts ? `(${dmNode.right.toHtml()})` : dmNode.right.toHtml();
            return `${lStr} ${targetOpSymbol} ${rStr}`;
        };
        return dmNode;
    }
    
    // REGEL 3: Wenn es ein normaler Operator (ohne direktes ! drüber) oder eine Variable ist -> Struktur erhalten, aber Kinder wandeln
    node.left = applyDeMorganToTree(node.left);
    node.right = applyDeMorganToTree(node.right);
    node.child = applyDeMorganToTree(node.child);
    
    // HTML-Ausgabe für normale Operatoren aktualisieren, falls sich darunter etwas geändert hat
    if (node.type === 'OP' && node.val !== '!') {
        node.toHtml = () => {
            let brauchtKlammerLinks = (node.left.type === 'OP' && node.left.val !== '!') || 
                                      (node.left.type === 'OP' && node.left.val === '!' && node.left.child && node.left.child.type === 'OP');
            let brauchtKlammerRechts = (node.right.type === 'OP' && node.right.val !== '!') || 
                                       (node.right.type === 'OP' && node.right.val === '!' && node.right.child && node.right.child.type === 'OP');
            let lStr = brauchtKlammerLinks ? `(${node.left.toHtml()})` : node.left.toHtml();
            let rStr = brauchtKlammerRechts ? `(${node.right.toHtml()})` : node.right.toHtml();
            return `${lStr} ${node.val} ${rStr}`;
        };
    }
    
    return node;
}

// Findet komplexe Negationen irgendwo im Baum (nicht nur ganz oben!)
function hatKomplexeNegation(parseResult) {
    let gefunden = false;
    function check(node) {
        if (!node) return;
        if (node.type === 'OP' && node.val === '!' && node.child && node.child.type === 'OP' && node.child.val !== '!') {
            gefunden = true;
        }
        check(node.child); check(node.left); check(node.right);
    }
    check(parseResult.root);
    return gefunden;
}

// Extrahiert alle Teilschritte als echte Knotenobjekte
function getSubFormulasForNode(rootNode) {
    let nodesList = [];
    let htmlCheck = [];
    
    function collect(node) {
        if (!node) return;
        if (node.type === 'OP') {
            collect(node.left);
            collect(node.right);
            collect(node.child);
            
            let htmlRep = node.toHtml();
            if (!htmlCheck.includes(htmlRep)) {
                htmlCheck.push(htmlRep);
                nodesList.push(node);
            }
        }
    }
    collect(rootNode);
    return nodesList;
}

// Universelle Render-Funktion für die Aufgaben-Tabellen
function renderFlexTable(rootNode, activeVariables, subFormulaNodes, tableElement) {
    tableElement.innerHTML = "";
    const numVars = activeVariables.length;
    const numRows = Math.pow(2, numVars);
    
    let headerRow = document.createElement('tr');
    let thInputs = document.createElement('th');
    thInputs.textContent = activeVariables.join(' ');
    headerRow.appendChild(thInputs);
    
    subFormulaNodes.forEach(node => {
        let th = document.createElement('th');
        th.innerHTML = node.toHtml();
        headerRow.appendChild(th);
    });
    tableElement.appendChild(headerRow);
    
    for (let i = numRows - 1; i >= 0; i--) {
        let env = {};
        let inputValues = [];
        activeVariables.forEach((variable, index) => {
            let shiftAmount = numVars - 1 - index;
            let bitValue = (i & (1 << shiftAmount)) ? 1 : 0;
            env[variable] = (bitValue === 1);
            inputValues.push(bitValue);
        });
        
        let row = document.createElement('tr');
        let tdInputs = document.createElement('td');
        tdInputs.textContent = inputValues.join(' ');
        tdInputs.style.fontWeight = "bold";
        row.appendChild(tdInputs);
        
        subFormulaNodes.forEach((node, idx) => {
            let td = document.createElement('td');
            td.textContent = node.evaluate(env) ? "1" : "0";
            if (idx === subFormulaNodes.length - 1) {
                td.style.backgroundColor = "rgba(59, 130, 246, 0.1)";
                td.style.fontWeight = "bold";
            }
            row.appendChild(td);
        });
        tableElement.appendChild(row);
    }
}

// Textsuch-Funktion (Abwärtskompatibilität für das Formelrad / den großen Rechner-Tab)
function evaluateSubTreeByHtml(node, targetHtml, env) {
    if (!node) return null;
    if (node.toHtml() === targetHtml) return node.evaluate(env);
    
    let leftRes = evaluateSubTreeByHtml(node.left, targetHtml, env);
    if (leftRes !== null) return leftRes;
    
    let rightRes = evaluateSubTreeByHtml(node.right, targetHtml, env);
    if (rightRes !== null) return rightRes;
    
    return evaluateSubTreeByHtml(node.child, targetHtml, env);
}

// Wird von deinem alten Code im Hauptskript zur Konvertierung aufgerufen
// REKURSIVER HTML-PARSER: Verarbeitet geschachtelte Negations-Spans absolut fehlerfrei
function convertHtmlToFormula(html) {
    // 1. Ein temporäres Hilfselement erstellen, um das HTML vom Browser parsen zu lassen
    let tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // 2. Rekursive Funktion zur Struktur-Analyse
    function nodeToText(element) {
        let textResult = "";
        
        element.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                // Reinen Text (Variablen oder Operatoren) übernehmen
                textResult += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // Wenn es ein Element ist (z.B. ein Span mit der Klasse 'not')
                if (node.classList.contains('not')) {
                    let innerText = nodeToText(node).trim();
                    
                    // Wenn der Inhalt komplex ist (also ein Operator drinsteckt) und keine Außenklammern hat,
                    // müssen wir Klammern setzen, damit das ! auf den ganzen Block wirkt.
                    if ((innerText.includes('∧') || innerText.includes('∨')) && !innerText.startsWith('(')) {
                        textResult += "!(" + innerText + ")";
                    } else {
                        textResult += "!" + innerText;
                    }
                } else {
                    // Falls es ein anderes Tag ist (z.B. <code> oder <strong>), einfach den Inhalt parsen
                    textResult += nodeToText(node);
                }
            }
        });
        
        return textResult;
    }
    
    // 3. HTML-Entities vereinheitlichen, bevor wir starten
    let bereinigtesHtml = tempDiv.innerHTML
        .replace(/&and;/g, '∧')
        .replace(/&or;/g, '∨')
        .replace(/&AMP;/gi, '&')
        .replace(/&LT;/gi, '<')
        .replace(/&GT;/gi, '>');
    tempDiv.innerHTML = bereinigtesHtml;
    
    // 4. Den Baum abwandern und das Ergebnis für den Shunting-Yard vorbereiten
    let formelText = nodeToText(tempDiv);
    
    // Doppelte Leerzeichen entfernen und zurückgeben
    return formelText.replace(/\s+/g, ' ').trim();
}