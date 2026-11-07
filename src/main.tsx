import './bounty.css';
import './questions.css';
import './drop-calendar.css';
import './radar.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Provider } from './context';
import './style.css';
import './workbench.css';
import './courtyard.css';
import './roster.css';
import './inventory.css';
import './scoring.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Provider><App /></Provider></React.StrictMode>);
