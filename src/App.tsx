import { BrowserRouter } from 'react-router';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-base-100 flex flex-col items-center justify-center p-8">
        <h1 className="text-4xl font-bold text-base-content mb-8">EasyCall</h1>
        <button className="btn btn-primary btn-lg min-h-14 min-w-14 text-xl">Get Started</button>
      </div>
    </BrowserRouter>
  );
}

export default App;
