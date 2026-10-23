import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";

// animation
const style = document.createElement("style");
style.innerHTML = `
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(25px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
  @keyframes progressMove {
  0% { width: 0%; }
  50% { width: 70%; }
  100% { width: 100%; }
}
`;
document.head.appendChild(style);

export default function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const uploadFile = async () => {
  if (!file) return alert("Select a file");

  const formData = new FormData();
  formData.append("file", file);

  setLoading(true);
  setResult(null);

  try {
    const res = await fetch("http://localhost:5001/api/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error analyzing file");

    // force delay 
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setResult(data);

    setHistory((prev) => [
      {
        fileName: file.name,
        risk: data.risk,
        prob: data.recoveryProbability,
        time: new Date().toLocaleTimeString(),
      },
      ...prev.slice(0, 9),
    ]);
  } catch (err) {
    // fetch itself failing (TypeError) means the backend is not reachable
    setResult({
      error:
        err instanceof TypeError
          ? "Cannot reach the backend on port 5001. Is it running?"
          : err.message || "Error analyzing file",
    });
  }

  setLoading(false);
};

  const getColor = (risk) => {
    if (risk === "High") return "#ef4444";
    if (risk === "Medium") return "#f59e0b";
    return "#22c55e";
  };

  //analytics 
  const stats = {
    total: history.length,
    high: history.filter(h => h.risk === "High").length,
    medium: history.filter(h => h.risk === "Medium").length,
    low: history.filter(h => h.risk === "Low").length,
  };

  const chartData = [
    { name: "High", value: stats.high },
    { name: "Medium", value: stats.medium },
    { name: "Low", value: stats.low },
  ];

  return (
  <div style={styles.app}>
    
    {/* HEADER */}
   <div style={{ ...styles.header, ...styles.fadeInSlow }}>
      <img src="/NCDCNewlogo.png" style={styles.logo} />
      <h2 style={styles.title}>NPA Recovery Dashboard</h2>
    </div>

    {/* MAIN CONTENT */}
    <div style={styles.container}>

      {/* KPI */}
      <div style={{ ...styles.kpiContainer, ...styles.fadeIn, animationDelay: "0.2s", animationFillMode: "both" }}>
        <div style={styles.kpiCard}>Total: {stats.total}</div>
        <div style={styles.kpiCard}>High Risk: {stats.high}</div>
        <div style={styles.kpiCard}>Medium Risk: {stats.medium}</div>
        <div style={styles.kpiCard}>Low Risk: {stats.low}</div>
      </div>

      {/* CARDS */}
      <div style={styles.content}>
        {/* Upload */}
       <div style={{ ...styles.card, ...styles.fadeIn, animationDelay: "0.3s", animationFillMode: "both" }}
  onMouseEnter={(e) => {
    e.currentTarget.style.transform = "translateY(-5px) scale(1.02)";
    e.currentTarget.style.boxShadow = "0 10px 30px rgba(59,130,246,0.2)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.transform = "none";
    e.currentTarget.style.boxShadow = "none";
  }}
>
          <h3>Upload Document</h3>
          <input type="file" onChange={(e) => setFile(e.target.files[0])} />
          <button onClick={uploadFile} style={styles.button}
  onMouseEnter={(e) => {
    e.currentTarget.style.boxShadow = "0 0 20px rgba(6,182,212,0.6)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.boxShadow = "none";
  }}
>Analyze</button>
          {loading && (
  <div style={styles.loaderContainer}>
    <div style={styles.progressBarBg}>
      <div style={styles.progressBar}></div>
    </div>
    <p style={styles.loadingText}>Analyzing document...</p>
  </div>
)}
        </div>

        {/* Result */}
        <div style={{ ...styles.card, ...styles.fadeIn, animationDelay: "0.4s", animationFillMode: "both" }}
  onMouseEnter={(e) => {
    e.currentTarget.style.transform = "translateY(-5px) scale(1.02)";
    e.currentTarget.style.boxShadow = "0 10px 30px rgba(59,130,246,0.2)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.transform = "none";
    e.currentTarget.style.boxShadow = "none";
  }}
>
          <h3>Result</h3>
          {result && !result.error && (
            <>
              <h2 style={{ color: getColor(result.risk) }}>
                {result.risk} Risk
              </h2>
              
              <p>Probability: {result.recoveryProbability}</p>
              <p>{result.reason}</p>
            </>
          )}
          {result && result.error && (
            <p style={{ color: "#ef4444" }}>{result.error}</p>
          )}
        </div>

        {/* Chart */}
        <div style={{ ...styles.card, ...styles.fadeIn, animationDelay: "0.5s", animationFillMode: "both" }}
  onMouseEnter={(e) => {
    e.currentTarget.style.transform = "translateY(-5px) scale(1.02)";
    e.currentTarget.style.boxShadow = "0 10px 30px rgba(59,130,246,0.2)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.transform = "none";
    e.currentTarget.style.boxShadow = "none";
  }}
>
          <h3>Risk Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" stroke="#ccc" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* HISTORY */}
     <div style={{ ...styles.tableCard, ...styles.fadeIn, animationDelay: "0.6s", animationFillMode: "both" }}>
        <h3>History</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>File</th>
              <th style={styles.th}>Risk</th>
              <th style={styles.th}>Prob</th>
              <th style={styles.th}>Time</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item, i) => (
              <tr key={i}>
                <td style={styles.td}>{item.fileName}</td>
                <td style={{ ...styles.td, color: getColor(item.risk) }}>
                  {item.risk}
                </td>
                <td style={styles.td}>{item.prob}</td>
                <td style={styles.td}>{item.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  </div>
);
}

const styles = {
 app: {
  background: "radial-gradient(circle at 20% 20%, rgba(59,130,246,0.15), transparent 40%), radial-gradient(circle at 80% 0%, rgba(6,182,212,0.15), transparent 40%), #0b1220",
  minHeight: "100vh",
  color: "#e2e8f0",
  fontFamily: "'Inter', sans-serif",
  animation: "fadeIn 0.8s ease",
},

  sidebar: {
  width: "230px",
  background: "linear-gradient(180deg, #0f172a, #020617)",
  padding: "20px",
  borderRight: "1px solid #1e293b",
},

  menu: { margin: "10px 0", opacity: 0.8 },

  main: { flex: 1 },

  header: {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "12px 20px",
  borderBottom: "1px solid rgba(59,130,246,0.2)",
  boxShadow: "0 2px 20px rgba(59,130,246,0.1)",
},

  kpiContainer: {
    display: "flex",
    gap: "15px",
    padding: "20px",
  },

  kpiCard: {
  flex: 1,
  background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
  padding: "20px",
  borderRadius: "14px",
  textAlign: "center",
  fontWeight: "600",
  color: "white",
  boxShadow: "0 5px 20px rgba(59,130,246,0.3)",
  transition: "0.3s",
},

  content: {
    display: "flex",
    gap: "20px",
    padding: "20px",
  },

  card: {
  flex: 1,
  background: "rgba(30, 41, 59, 0.6)",
  backdropFilter: "blur(12px)",
  padding: "20px",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.05)",
  transition: "all 0.3s ease",
  cursor: "pointer",
},

  input: { width: "100%", margin: "10px 0" },

  button: {
  width: "100%",
  padding: "12px",
  background: "linear-gradient(135deg, #06b6d4, #3b82f6)",
  border: "none",
  borderRadius: "10px",
  color: "white",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all 0.3s ease",
},

  tableCard: {
  margin: "20px",
  background: "rgba(30, 41, 59, 0.6)",
  backdropFilter: "blur(10px)",
  padding: "20px",
  borderRadius: "16px",
},

  table: { width: "100%" },

  th: { textAlign: "left", padding: "10px" },

  td: { padding: "10px" },

  fadeIn: {
  animation: "fadeInUp 0.6s ease",
},

fadeInSlow: {
  animation: "fadeIn 1s ease",
},
  logoContainer: {
  width: "100%",
  marginBottom: "20px",
},

logo: {
  width: "50%",      
  height: "auto",
  objectFit: "contain",
},

logoText: {
  fontSize: "20px",
  fontWeight: "700",
},
menu: {
  margin: "10px 0",
  padding: "10px",
  borderRadius: "8px",
  background: "rgba(59,130,246,0.1)",
},
container: {
  maxWidth: "1200px",
  margin: "0 auto",
  padding: "10px 20px",   
},
title: {
  fontSize: "22px",
  fontWeight: "600",
  margin: 0,   
},
loaderContainer: {
  width: "100%",
  marginTop: "15px",
},

progressBarBg: {
  width: "100%",
  height: "8px",
  background: "rgba(255,255,255,0.1)",
  borderRadius: "10px",
  overflow: "hidden",
},

progressBar: {
  height: "100%",
  background: "linear-gradient(90deg, #06b6d4, #3b82f6)",
  borderRadius: "10px",
  animation: "progressMove 2s ease forwards",
},

loadingText: {
  marginTop: "8px",
  fontSize: "14px",
  opacity: 0.8,
},

};