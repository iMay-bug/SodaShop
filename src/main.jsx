import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Se você tiver um arquivo index.css global, importe aqui também.
// import './index.css' 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)