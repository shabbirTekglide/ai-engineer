import { useDispatch, useSelector } from 'react-redux';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Progress } from '../../components/ui/Progress';
import { Separator } from '../../components/ui/Seperator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/Tabs';
import { Clock, Play, Send, ChevronLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { getCurrentLecture } from '../../store/slicers/lectureSlice';
import { formatDateTime } from '../../utils/utilities';
import { toast } from 'react-toastify';
import ReactSpinner from '../../components/ReactSpinner';
import { CgExport } from "react-icons/cg";
import { IoMdDownload } from 'react-icons/io';
import { useLocation } from "react-router-dom";
import ReactMarkdown from 'react-markdown';

const markdownComponents = {
  h1: ({node, ...props}) => (
    <h1 
      style={{
        color: '#2160A0', 
        fontSize: '1.875rem', 
        fontWeight: 700, 
        borderBottom: '2px solid #2160A0', 
        paddingBottom: '0.5rem', 
        marginBottom: '1.5rem', 
        marginTop: 0
      }} 
      {...props} 
    />
  ),
  h2: ({node, ...props}) => (
    <h2 
      style={{
        color: '#2160A0', 
        fontSize: '1.5rem', 
        fontWeight: 600, 
        marginTop: '2rem', 
        marginBottom: '1rem'
      }} 
      {...props} 
    />
  ),
  h3: ({node, ...props}) => (
    <h3 
      style={{
        color: '#2160A0', 
        fontSize: '1.25rem', 
        fontWeight: 600, 
        marginTop: '1.5rem', 
        marginBottom: '0.75rem'
      }} 
      {...props} 
    />
  ),
  p: ({node, ...props}) => (
    <p 
      style={{
        marginBottom: '1rem',
        color: '#111827'
      }} 
      {...props} 
    />
  ),
  ul: ({node, ...props}) => (
    <ul 
      style={{
        marginLeft: '1.5rem',
        marginBottom: '1rem',
        listStyleType: 'disc',
        paddingLeft: '1.5rem'
      }} 
      {...props} 
    />
  ),
  ol: ({node, ...props}) => (
    <ol 
      style={{
        marginLeft: '1.5rem',
        marginBottom: '1rem',
        listStyleType: 'decimal',
        paddingLeft: '1.5rem'
      }} 
      {...props} 
    />
  ),
  li: ({node, ...props}) => (
    <li 
      style={{
        marginBottom: '0.5rem',
        color: '#111827',
        display: 'list-item'
      }} 
      {...props} 
    />
  ),
  blockquote: ({node, ...props}) => (
    <blockquote 
      style={{
        borderLeft: '4px solid #2160A0',
        paddingLeft: '1rem',
        margin: '1rem 0',
        color: '#111827',
        fontStyle: 'italic',
        backgroundColor: '#fafafa',
        padding: '1rem',
        borderRadius: '0 4px 4px 0'
      }} 
      {...props} 
    />
  ),
  table: ({node, ...props}) => (
    <div style={{overflowX: 'auto', margin: '1.5rem 0'}}>
      <table style={{width: '100%', borderCollapse: 'collapse'}} {...props} />
    </div>
  ),
  th: ({node, ...props}) => (
    <th 
      style={{
        backgroundColor: '#E7F1FB',
        color: '#111827',
        fontWeight: 600,
        textAlign: 'left',
        padding: '0.75rem 1rem',
        border: '1px solid #d0dae4'
      }} 
      {...props} 
    />
  ),
  td: ({node, ...props}) => (
    <td 
      style={{
        padding: '0.75rem 1rem',
        border: '1px solid #d0dae4'
      }} 
      {...props} 
    />
  ),
  hr: ({node, ...props}) => (
    <hr 
      style={{
        border: 'none',
        borderTop: '2px solid #2160A0',
        margin: '2rem 0'
      }} 
      {...props} 
    />
  ),
  code: ({node, inline, ...props}) => (
    inline ? (
      <code 
        style={{
          backgroundColor: '#f8f9fa',
          padding: '0.2rem 0.4rem',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '0.9em'
        }} 
        {...props} 
      />
    ) : (
      <code {...props} />
    )
  ),
  pre: ({node, ...props}) => (
    <pre 
      style={{
        backgroundColor: '#f8f9fa',
        padding: '1rem',
        borderRadius: '4px',
        overflowX: 'auto',
        margin: '1rem 0'
      }} 
      {...props} 
    />
  ),
};

export default function LecturePage() {
  const { classId, lectureId } = useParams();
  const { lectures, currentLecture } = useSelector((state) => state.lecture)
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("notes");
  const notesContainerRef = useRef(null);
const location = useLocation();
  const dispatch = useDispatch()
  useEffect(() => {
    const fetchLecture = async () => {
      setIsLoading(true)
      try {
        if (lectureId) {
          await dispatch(getCurrentLecture(lectureId))
        }
      } catch (error) {
        toast.error(error || error.response?.data?.message || error.message)
      } finally {
        setIsLoading(false);
      }
    }

    fetchLecture();
  }, [dispatch, lectureId])



  const downloadAsStyledHtml = (markdownContent, filename = currentLecture?.title) => {
    if (!markdownContent) {
      toast.error('No content to download');
      return;
    }

    // Get the rendered HTML from the container
    let htmlContent = '';
    if (notesContainerRef.current) {
      // Clone the container to get its HTML
      const container = notesContainerRef.current.cloneNode(true);
      
      // Remove the style tag if present
      const styleTag = container.querySelector('style');
      if (styleTag) {
        styleTag.remove();
      }
      
      // Get innerHTML (ReactMarkdown renders content as children)
      htmlContent = container.innerHTML.trim();
      
      // If empty, fallback to markdown conversion
      if (!htmlContent) {
        htmlContent = convertMarkdownToHtml(markdownContent);
      }
    } else {
      // Fallback: convert markdown to HTML manually (basic conversion)
      htmlContent = convertMarkdownToHtml(markdownContent);
    }

    // Create complete HTML document with Kora styling
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${filename || 'Lecture Notes'}</title>
  <style>
    :root {
      --kora-primary: #2160A0;
      --kora-light: #E7F1FB;
      --kora-text: #111827;
      --kora-bg: #f9fafb;
      --kora-border: #d0dae4;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: var(--kora-bg);
      color: var(--kora-text);
      line-height: 1.6;
      padding: 2rem 1rem;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      padding: 2.5rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    h1 {
      color: var(--kora-primary);
      font-size: 1.875rem;
      font-weight: 700;
      border-bottom: 2px solid var(--kora-primary);
      padding-bottom: 0.5rem;
      margin-bottom: 1.5rem;
      margin-top: 0;
    }
    
    h2 {
      color: var(--kora-primary);
      font-size: 1.5rem;
      font-weight: 600;
      margin-top: 2rem;
      margin-bottom: 1rem;
    }
    
    h3 {
      color: var(--kora-primary);
      font-size: 1.25rem;
      font-weight: 600;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
    }
    
    p {
      margin-bottom: 1rem;
      color: var(--kora-text);
    }
    
    ul, ol {
      margin-left: 1.5rem;
      margin-bottom: 1rem;
      list-style-type: disc;
      padding-left: 1.5rem;
      list-style-position: outside;
    }
    
    ol {
      list-style-type: decimal;
    }
    
    li {
      margin-bottom: 0.5rem;
      color: var(--kora-text);
      display: list-item;
      list-style-position: outside;
    }
    
    ul ul, ol ol {
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
    }
    
    ul ul {
      list-style-type: circle;
    }
    
    ul ul ul {
      list-style-type: square;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
    }
    
    th {
      background-color: var(--kora-light);
      color: var(--kora-text);
      font-weight: 600;
      text-align: left;
      padding: 0.75rem 1rem;
      border: 1px solid var(--kora-border);
    }
    
    td {
      padding: 0.75rem 1rem;
      border: 1px solid var(--kora-border);
    }
    
    blockquote {
      border-left: 4px solid var(--kora-primary);
      padding-left: 1rem;
      margin: 1rem 0;
      color: var(--kora-text);
      font-style: italic;
      background-color: #fafafa;
      padding: 1rem;
      border-radius: 0 4px 4px 0;
    }
    
    hr {
      border: none;
      border-top: 2px solid var(--kora-primary);
      margin: 2rem 0;
    }
    
    code {
      background-color: #f8f9fa;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.9em;
    }
    
    pre {
      background-color: #f8f9fa;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
      margin: 1rem 0;
    }
    
    pre code {
      background-color: transparent;
      padding: 0;
    }
    
    strong {
      color: var(--kora-text);
      font-weight: 600;
    }
    
    .wrap-up-wrapper {
      background-color: var(--kora-light);
      padding: 1.5rem;
      border-radius: 8px;
      margin-top: 1rem;
      margin-bottom: 2rem;
    }
    
    .wrap-up-wrapper > *:first-child {
      margin-top: 0;
    }
    
    .wrap-up-wrapper > *:last-child {
      margin-bottom: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    ${htmlContent}
  </div>
</body>
</html>`;

    // Ensure filename has .html extension
    const finalFilename = filename.endsWith('.html') ? filename : `${filename}.html`;

    // Create a Blob with the HTML content
    const blob = new Blob([fullHtml], { type: 'text/html' });

    // Create a temporary URL for the Blob
    const url = URL.createObjectURL(blob);

    // Create a temporary anchor element
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFilename;
    a.style.display = 'none';

    // Append to body, click, and remove
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up the URL
    URL.revokeObjectURL(url);
  };

  // Helper function to convert markdown to HTML (basic conversion)
  const convertMarkdownToHtml = (markdown) => {
    let html = markdown;
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Blockquotes
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
    
    // Horizontal rules
    html = html.replace(/^---$/gim, '<hr>');
    
    // Lists (basic)
    html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Paragraphs (lines that don't start with HTML tags)
    html = html.split('\n').map(line => {
      if (line.trim() && !line.match(/^<[h|u|o|b|p|d|t]/) && !line.match(/^<\/[h|u|o|b|p|d|t]/)) {
        return `<p>${line}</p>`;
      }
      return line;
    }).join('\n');
    
    return html;
  };

  return (
    <>
      {
        isLoading ? (
          <ReactSpinner />
        ) : (
          <div className="flex flex-col min-h-screen bg-muted/20">
            <main className="flex-1 py-8 px-4">
              <div className="max-w-4xl mx-auto">
                <header className="mb-6 flex items-center gap-2">
                  <Button variant="ghost" size="icon" asChild>
                    <Link
                     to={`/student/my-classes/${classId}?tab=${location.state?.fromTab || "lectures"}`}
                    >
                      <ChevronLeft />
                    </Link>
                  </Button >
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                      {currentLecture?.title}
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                      {currentLecture?.recordedAt && formatDateTime(currentLecture?.recordedAt)}
                    </p>
                  </div>
                </header >

                <Card className="shadow-xl">
                  <CardContent className="p-3 md:p-6">
                    <Tabs defaultValue="notes" onValueChange={(value) => setActiveTab(value)}>
                      <div className="flex justify-between items-center mb-4">
                        <TabsList>
                          <TabsTrigger className="cursor-pointer" value="notes">Notes</TabsTrigger>
                          <TabsTrigger className="cursor-pointer" value="transcript">Transcript</TabsTrigger>
                        </TabsList>

                        {/* Hide button when Transcript tab is active */}
                        {activeTab === "notes" && (
                          <div className="flex gap-2">
                            <Button
                              variant="default"
                              onClick={() => downloadAsStyledHtml(currentLecture?.notes?.overview)}
                              className="bg-accent hover:bg-accent/90"
                            >
                            <IoMdDownload className='!w-5 !h-5'/> Export Notes
                             
                            </Button>
                          </div>
                        )}
                      </div>

                      <Separator />

                      <TabsContent value="notes" className="mt-6 space-y-6">
                        {currentLecture?.notes?.overview ? (
                          <div className="kora-notes-container" ref={notesContainerRef}>
                            <style>{`
                              .kora-notes-container {
                                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                                color: #111827;
                                line-height: 1.6;
                                max-width: 900px;
                                margin: 0 auto;
                              }
                              
                              .kora-notes-container h1 {
                                color: #2160A0;
                                font-size: 1.875rem;
                                font-weight: 700;
                                border-bottom: 2px solid #2160A0;
                                padding-bottom: 0.5rem;
                                margin-bottom: 1.5rem;
                                margin-top: 0;
                              }
                              
                              .kora-notes-container h2 {
                                color: #2160A0;
                                font-size: 1.5rem;
                                font-weight: 600;
                                margin-top: 2rem;
                                margin-bottom: 1rem;
                              }
                              
                              .kora-notes-container h3 {
                                color: #2160A0;
                                font-size: 1.25rem;
                                font-weight: 600;
                                margin-top: 1.5rem;
                                margin-bottom: 0.75rem;
                              }
                              
                              .kora-notes-container p {
                                margin-bottom: 1rem;
                                color: #111827;
                              }
                              
                              .kora-notes-container ul,
                              .kora-notes-container ol {
                                margin-left: 1.5rem !important;
                                margin-bottom: 1rem !important;
                                list-style-type: disc !important;
                                padding-left: 1.5rem !important;
                                list-style-position: outside !important;
                              }
                              
                              .kora-notes-container ol {
                                list-style-type: decimal !important;
                              }
                              
                              .kora-notes-container li {
                                margin-bottom: 0.5rem !important;
                                color: #111827 !important;
                                display: list-item !important;
                                list-style-position: outside !important;
                              }
                              
                              .kora-notes-container ul ul {
                                list-style-type: circle !important;
                              }
                              
                              .kora-notes-container ul ul ul {
                                list-style-type: square !important;
                              }
                              
                              .kora-notes-container ul ul,
                              .kora-notes-container ol ol {
                                margin-top: 0.5rem;
                                margin-bottom: 0.5rem;
                              }
                              
                              .kora-notes-container table {
                                width: 100%;
                                border-collapse: collapse;
                                margin: 1.5rem 0;
                              }
                              
                              .kora-notes-container th {
                                background-color: #E7F1FB;
                                color: #111827;
                                font-weight: 600;
                                text-align: left;
                                padding: 0.75rem 1rem;
                                border: 1px solid #d0dae4;
                              }
                              
                              .kora-notes-container td {
                                padding: 0.75rem 1rem;
                                border: 1px solid #d0dae4;
                              }
                              
                              .kora-notes-container blockquote {
                                border-left: 4px solid #2160A0;
                                padding-left: 1rem;
                                margin: 1rem 0;
                                color: #111827;
                                font-style: italic;
                                background-color: #fafafa;
                                padding: 1rem;
                                border-radius: 0 4px 4px 0;
                              }
                              
                              .kora-notes-container hr {
                                border: none;
                                border-top: 2px solid #2160A0;
                                margin: 2rem 0;
                              }
                              
                              .kora-notes-container code {
                                background-color: #f8f9fa;
                                padding: 0.2rem 0.4rem;
                                border-radius: 4px;
                                font-family: monospace;
                                font-size: 0.9em;
                              }
                              
                              .kora-notes-container pre {
                                background-color: #f8f9fa;
                                padding: 1rem;
                                border-radius: 4px;
                                overflow-x: auto;
                                margin: 1rem 0;
                              }
                              
                              .kora-notes-container pre code {
                                background-color: transparent;
                                padding: 0;
                              }
                              
                              .kora-notes-container strong {
                                color: #111827;
                                font-weight: 600;
                              }
                              
                              /* Wrap-up wrapper styling (added via JS) */
                              .kora-notes-container .wrap-up-wrapper {
                                background-color: #E7F1FB;
                                padding: 1.5rem;
                                border-radius: 8px;
                                margin-top: 1rem;
                                margin-bottom: 2rem;
                              }
                              
                              .kora-notes-container .wrap-up-wrapper > *:first-child {
                                margin-top: 0;
                              }
                              
                              .kora-notes-container .wrap-up-wrapper > *:last-child {
                                margin-bottom: 0;
                              }
                            `}</style>
                            {currentLecture.notes.overview.split(/(?=^##\s)/m).map((section, index) => {
                              const isWrapUp = /^##\s.*(?:wrap-up|summary)/i.test(section);
                              if (isWrapUp) {
                                return (
                                  <div key={index} className="wrap-up-wrapper">
                                    <ReactMarkdown components={markdownComponents}>
                                      {section}
                                    </ReactMarkdown>
                                  </div>
                                );
                              }
                              return (
                                <ReactMarkdown key={index} components={markdownComponents}>
                                  {section}
                                </ReactMarkdown>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No notes available for this lecture.</p>
                        )}
                      </TabsContent>

                      <TabsContent value="transcript" className="mt-6">
                        <p className="text-muted-foreground">
                          {currentLecture?.transcript?.fullTranscript}
                        </p>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div >
            </main >
            {/* <footer className="sticky bottom-0 bg-background/95 backdrop-blur-sm shadow-t border-t">
        <div className="max-w-4xl mx-auto p-4">
          <div className="relative">
            <Input
              placeholder="Ask Kora anything..."
              className="pl-4 pr-12 rounded-full text-base focus:ring-2 focus:ring-[#5589F1]"
            />
            <Button
              type="submit"
              size="icon"
              className="rounded-full absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8"
            >
              <Send />
            </Button>
          </div>
        </div>
      </footer> */}
          </div >
        )
      }


    </ >
  );
}
