"use client";

import Papa from "papaparse";
import { Upload } from "lucide-react";
import type { CustomerRow, GeneratedEmail } from "../lib/types";
import { useState } from "react";

type Props = {
    onResults: (emails: GeneratedEmail[]) => void;
};

export default function CsvUploader({ onResults }: Props) {
    const [loading, setLoading] = useState(false);
    const [fileName, setFileName] = useState("");

    async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];

        if (!file) return;

        setFileName(file.name);

        Papa.parse<CustomerRow>(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                setLoading(true);

                try {
                    const res = await fetch("/api/analyse-customers", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            customers: results.data,
                        }),
                    });

                    const data = await res.json();

                    if (!res.ok) {
                        alert(data.error || "Failed to analyse customers.");
                        return;
                    }

                    onResults(data.emails);
                } catch (error) {
                    alert("Something went wrong.");
                    console.error(error);
                } finally {
                    setLoading(false);
                }
            },
        });
    }

    return (
        <div className="uploadCard">
            <div className="uploadIcon">
                <Upload size={28} />
            </div>

            <h2>Upload your customer list</h2>

            <p>
                Upload a CSV and the AI will analyse each customer, detect risk, and
                create personalised emails.
            </p>

            <label className="uploadButton">
                {loading ? "Analysing..." : "Choose CSV file"}
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    disabled={loading}
                />
            </label>

            {fileName && <span className="fileName">{fileName}</span>}
        </div>
    );
}