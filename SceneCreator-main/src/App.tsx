import { HashRouter, Routes, Route } from 'react-router-dom';
import { Login } from './pages/auth/Login';
import { Home } from './pages/Home';
import { NotAuthorized } from './pages/auth/NotAuthorized';
import { SceneCreator } from './pages/SceneCreator';
import { ProtectedRoute } from './pages/auth/ProtectedRoute';
import { AddModel } from './pages/AddModel';
import { ProductLibrary } from './pages/ProductLibrary';
import { AvatarSelection } from './pages/AvatarSelection';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<NotAuthorized />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scene/:homeId"
          element={
            <ProtectedRoute>
              <SceneCreator />
            </ProtectedRoute>
          }
        />
        <Route
          path="/add-model"
          element={
            <ProtectedRoute>
              <AddModel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/product-library"
          element={
            <ProtectedRoute>
              <ProductLibrary />
            </ProtectedRoute>
          }
        />
        <Route
          path="/avatar-selection"
          element={
            <ProtectedRoute>
              <AvatarSelection />
            </ProtectedRoute>
          }
        />
      </Routes>
    </HashRouter>
  );
}

export default App;
