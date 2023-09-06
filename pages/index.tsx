import { useRef, useState, useEffect } from 'react';
import Layout from '@/components/layout';
import styles from '@/styles/Home.module.css';
import { Message } from '@/types/chat';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import LoadingDots from '@/components/ui/LoadingDots';
import { Document } from 'langchain/document';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export default function Home() {
  const [dataFields, setDataFields] = useState<string[]>([
    'Invoice_Number',
    'Quantity',
  ]);
  const [dataFieldsDescription, setDataFieldsDescription] = useState<string[]>([
    'a unique, sequential code that is systematically assigned to invoices',
    'total quantity of commodities',
  ]);

  const [dataField, setDataField] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string>('');

  async function handleSubmit(e: any) {
    e.preventDefault();
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataFields,
          dataFieldsDescription,
        }),
      });
      const data = await response.json();
      setResult(data);

      if (data.error) {
        setError(data.error);
      } else {
      }
    } catch (error) {
      setError('An error occurred while fetching the data. Please try again.');
      console.log('error', error);
    }
  }

  //prevent empty submissions
  const handleDataFieldEnter = (e: any) => {
    if (e.key === 'Enter' && dataField) {
      setDataFields([...dataFields, e.target.value]);
      setDataField('');
    } else if (e.key == 'Enter') {
      e.preventDefault();
    }
  };

  const handleDataFieldDescriptionEnter = (e: any) => {
    if (e.key === 'Enter' && description) {
      setDataFieldsDescription([...dataFieldsDescription, e.target.value]);
      setDescription('');
    } else if (e.key == 'Enter') {
      e.preventDefault();
    }
  };

  return (
    <>
      <Layout>
        <div className={styles.container}>
          <div className={styles.leftDiv}>
            <div className={styles.cloudform}>
              <form onSubmit={handleDataFieldEnter}>
                <textarea
                  onKeyDown={handleDataFieldEnter}
                  autoFocus={false}
                  rows={1}
                  maxLength={512}
                  id="userInput"
                  name="userInput"
                  placeholder={'Add data field'}
                  value={dataField}
                  onChange={(e) => setDataField(e.target.value)}
                  className={styles.textarea}
                />
                <button
                  className={styles.generatebutton}
                  onClick={handleDataFieldEnter}
                >
                  Add
                </button>
              </form>
            </div>

            <div className="mx-auto flex flex-col gap-4">
              <main className={styles.main}>
                <div className={styles.cloud}>
                  {dataFields.map((item, index) => {
                    return (
                      <div key={index} className={styles.usermessage}>
                        <div
                          key={`chatMessage-${index}`}
                          className="markdownanswer"
                        >
                          <ReactMarkdown linkTarget="_blank">
                            {item}
                          </ReactMarkdown>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {error && (
                  <div className="border border-red-400 rounded-md p-4">
                    <p className="text-red-500">{error}</p>
                  </div>
                )}
              </main>
            </div>
          </div>
          <div className={styles.rightDiv}>
            {' '}
            <div className={styles.cloudform}>
              <form onSubmit={handleDataFieldDescriptionEnter}>
                <textarea
                  onKeyDown={handleDataFieldDescriptionEnter}
                  autoFocus={false}
                  rows={1}
                  maxLength={512}
                  id="userInput"
                  name="userInput"
                  placeholder={'Add data field description'}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={styles.textarea}
                />
                <button type="submit" className={styles.generatebutton}>
                  Add
                </button>
              </form>
            </div>
            <div className="mx-auto flex flex-col gap-4">
              <main className={styles.main}>
                <div className={styles.cloud}>
                  {dataFieldsDescription.map((item, index) => {
                    return (
                      <div key={index} className={styles.usermessage}>
                        <div
                          key={`chatMessage-${index}`}
                          className="markdownanswer"
                        >
                          <ReactMarkdown linkTarget="_blank">
                            {item}
                          </ReactMarkdown>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {error && (
                  <div className="border border-red-400 rounded-md p-4">
                    <p className="text-red-500">{error}</p>
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>
        <div className={styles.extractAllDiv}>
          <button className={styles.extractAllButton} onClick={handleSubmit}>
            Extract All
          </button>
          <p>{result != '' && JSON.stringify(result)}</p>
        </div>
      </Layout>
    </>
  );
}
