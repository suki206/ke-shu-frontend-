import ChatPage from './pages/ChatPage'

function App() {
  return (
    <div style={{ 
      height: '100vh', 
      width: '100vw', 
      overflow: 'hidden', 
      display: 'flex',
      position: 'fixed',
      top: 0,
      left: 0
    }}>
      <ChatPage />
    </div>
  )
}

export default App