// --- File: server.js (Phiên bản nâng cấp, thêm Trợ lý AI và phục vụ giao diện) ---

// --- Giai đoạn 1: Nạp các "phụ tùng" ---
console.log("Bắt đầu khởi tạo server...");

try {
    const express = require('express');
    const path = require('path'); // Thêm 'path' để làm việc với đường dẫn tệp
    const fetch = require('node-fetch');
    const cors = require('cors'); 
    require('dotenv').config(); 

    console.log("Tất cả thư viện đã được nạp thành công.");

    // --- Giai đoạn 2: Tạo ra máy chủ ---
    const app = express();
    app.use(cors()); 
    app.use(express.json({ limit: '5mb' })); // Tăng giới hạn payload để chứa dữ liệu bệnh nhân

    // --- MỚI: Phục vụ các tệp tĩnh (HTML, CSS, JS) từ thư mục 'public' ---
    app.use(express.static(path.join(__dirname, 'public')));


    // --- Giai đoạn 3: Lấy API Key ---
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        console.error("!!! LỖI: Biến môi trường GEMINI_API_KEY chưa được thiết lập.");
        process.exit(1); 
    } else {
        console.log("API Key đã được nạp thành công.");
    }

    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

    // --- Giai đoạn 4: Tạo các "cánh cửa" API ---

    // CÁNH CỬA 1: Dành cho việc nhập liệu
    app.post('/api/import-patients', async (req, res) => {
        console.log("Đã nhận được yêu cầu tại /api/import-patients...");
        try {
            const { rawData } = req.body;
            if (!rawData) {
                return res.status(400).json({ message: "Dữ liệu đầu vào không được để trống." });
            }
            const prompt = `Bạn là một trợ lý phân tích dữ liệu thông minh cho một ứng dụng y tế. Nhiệm vụ của bạn là chuyển đổi dữ liệu văn bản thô, có thể được sao chép từ một bảng tính hoặc nhập thủ công, thành một mảng JSON có cấu trúc gồm các đối tượng bệnh nhân.
            QUY TẮC PHÂN TÍCH CÚ PHÁP:
            - Mỗi dòng trong đầu vào thường đại diện cho một bệnh nhân.
            - Dữ liệu có thể không theo thứ tự cố định, nhưng hãy cố gắng xác định các trường sau: Name (Tên), Year of Birth (Năm sinh), Phone (SĐT), Last Exam Date (Ngày khám), Revisit Days (Số ngày hẹn), Notes (Ghi chú), Subject (Đối tượng).
            - **QUAN TRỌNG:** Chỉ điền trường 'subject' nếu có một chuỗi văn bản (thường là mã như THAA, DTDB) đứng **trước** tên bệnh nhân. Nếu không có gì trước tên, hãy để 'subject' là null hoặc chuỗi rỗng.
            - **QUAN TRỌNG:** Chỉ điền trường 'yearOfBirth' nếu có một số có 4 chữ số nằm **giữa** tên bệnh nhân và ngày khám. Nếu không, hãy để 'yearOfBirth' là null.
            - Tên và Ngày khám là các trường bắt buộc phải có.
            - Diễn giải các khoảng thời gian: '2 tuần' -> 14, '1 tháng' -> 30.
            - Đầu ra PHẢI là một mảng JSON hợp lệ.
            Dữ liệu văn bản thô:
            "${rawData}"`;
            
            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                "subject": { "type": "STRING" }, "name": { "type": "STRING" }, "yearOfBirth": { "type": "NUMBER" }, "phone": { "type": "STRING" }, "lastExamDate": { "type": "STRING" }, "revisitDays": { "type": "NUMBER" }, "notes": { "type": "STRING" }
                            },
                            "required": ["name", "lastExamDate"]
                        }
                    }
                }
            };
            
            const geminiResponse = await fetch(geminiApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!geminiResponse.ok) throw new Error(`Lỗi từ Gemini API: ${geminiResponse.statusText}`);
            const result = await geminiResponse.json();
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            res.status(200).json(JSON.parse(jsonText));

        } catch (error) {
            console.error('Lỗi trong quá trình xử lý import:', error);
            res.status(500).json({ message: 'Đã có lỗi xảy ra phía máy chủ' });
        }
    });

    // CÁNH CỬA 2: Dành cho Trợ lý AI
    app.post('/api/assistant', async (req, res) => {
        console.log("Đã nhận được yêu cầu tại /api/assistant...");
        try {
            const { query, context } = req.body;
            if (!query) {
                return res.status(400).json({ message: "Câu hỏi không được để trống." });
            }

            const today = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

            const prompt = `Bạn là một trợ lý phân tích dữ liệu phòng khám thông minh và súc tích. Bạn sẽ nhận được một câu hỏi từ người dùng và một bộ dữ liệu bệnh nhân dưới dạng JSON. Nhiệm vụ của bạn là trả lời câu hỏi đó CHỈ DỰA TRÊN dữ liệu được cung cấp.

            QUY TẮC:
            - Trả lời ngắn gọn, đi thẳng vào vấn đề.
            - Nếu câu hỏi yêu cầu liệt kê, hãy dùng gạch đầu dòng (-).
            - Nếu dữ liệu không đủ để trả lời, hãy nói rằng "Dữ liệu hiện tại không đủ để trả lời câu hỏi này."
            - Luôn trả lời bằng tiếng Việt.
            - Hôm nay là ngày ${today}.

            Dữ liệu bệnh nhân hiện tại:
            ${JSON.stringify(context, null, 2)}

            Câu hỏi của người dùng: "${query}"`;
            
            const payload = {
                contents: [{ parts: [{ text: prompt }] }]
            };

            const geminiResponse = await fetch(geminiApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!geminiResponse.ok) {
                const errorText = await geminiResponse.text();
                console.error("Lỗi từ Gemini API:", errorText);
                throw new Error(`Lỗi từ Gemini API: ${geminiResponse.statusText}`);
            }

            const result = await geminiResponse.json();
            const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            console.log("Trợ lý AI đã xử lý xong.");
            res.status(200).json({ response: responseText || "Tôi không thể xử lý yêu cầu này." });

        } catch (error) {
            console.error('Lỗi trong quá trình xử lý của trợ lý AI:', error);
            res.status(500).json({ message: 'Đã có lỗi xảy ra phía máy chủ' });
        }
    });

    // --- Giai đoạn 5: Khởi động máy chủ ---
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`>>> Máy chủ trung gian đang lắng nghe tại cổng ${PORT}`);
    });

} catch (e) {
    console.error("!!! Lỗi khởi tạo server:", e);
}
