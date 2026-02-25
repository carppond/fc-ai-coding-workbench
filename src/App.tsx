import { AppShell } from "./components/layout/AppShell";
import { ToastProvider } from "./components/common/Toast";
import { ConfirmProvider } from "./components/common/ConfirmDialog";
import "./styles/layout.css";

function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppShell />
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;
