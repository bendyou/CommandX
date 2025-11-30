import { useState, useEffect } from 'react'
import Editor from 'react-simple-code-editor'
import Prism from 'prismjs'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-sql'
import 'prismjs/themes/prism.css'
import './CodeEditor.css'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: string
  placeholder?: string
  readOnly?: boolean
}

// Функция для определения языка по расширению файла
export const detectLanguage = (fileName: string): string => {
  const ext = fileName.toLowerCase().split('.').pop() || ''
  
  const languageMap: { [key: string]: string } = {
    'py': 'python',
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'css': 'css',
    'html': 'markup',
    'htm': 'markup',
    'json': 'json',
    'sh': 'bash',
    'bash': 'bash',
    'yml': 'yaml',
    'yaml': 'yaml',
    'sql': 'sql',
    'xml': 'markup',
    'md': 'markdown',
    'vue': 'javascript',
    'php': 'php',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'r': 'r',
    'lua': 'lua',
    'pl': 'perl',
    'zsh': 'bash',
    'fish': 'bash',
  }
  
  return languageMap[ext] || 'text'
}

// Функция для получения языка подсветки
const getLanguage = (lang: string): any => {
  switch (lang) {
    case 'python':
      return Prism.languages.python
    case 'javascript':
      return Prism.languages.javascript
    case 'typescript':
      return Prism.languages.typescript
    case 'jsx':
      return Prism.languages.jsx
    case 'tsx':
      return Prism.languages.jsx
    case 'css':
      return Prism.languages.css
    case 'markup':
      return Prism.languages.markup
    case 'json':
      return Prism.languages.json
    case 'bash':
      return Prism.languages.bash
    case 'yaml':
      return Prism.languages.yaml
    case 'sql':
      return Prism.languages.sql
    default:
      return Prism.languages.text || Prism.languages.plain
  }
}

export default function CodeEditor({ 
  value, 
  onChange, 
  language = 'text',
  placeholder = 'Введите код...',
  readOnly = false 
}: CodeEditorProps) {
  const [detectedLang, setDetectedLang] = useState(language)

  useEffect(() => {
    if (language && language !== 'text') {
      setDetectedLang(language)
    }
  }, [language])

  const highlightCode = (code: string) => {
    const lang = getLanguage(detectedLang)
    try {
      return Prism.highlight(code, lang, detectedLang)
    } catch (e) {
      return code
    }
  }

  return (
    <div className="code-editor-wrapper">
      <Editor
        value={value}
        onValueChange={onChange}
        highlight={highlightCode}
        padding={10}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{
          fontFamily: '"Fira code", "Fira Mono", monospace',
          fontSize: 14,
          outline: 0,
          minHeight: '400px',
          maxHeight: '600px',
          overflow: 'auto',
        }}
        textareaClassName="code-editor-textarea"
        preClassName="code-editor-pre"
      />
    </div>
  )
}

