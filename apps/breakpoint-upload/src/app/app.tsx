import React, { useCallback, useState } from 'react';
import Menu, { MenuItem } from './components/Menu';
import BreakpointFileUpload from './components/BreakpointFileUpload';
import Settings from './components/Settings';
import { Typography } from 'antd';

const { Title, Paragraph, Text, Link } = Typography;

export const App = () => {
  const [view, setView] = useState(MenuItem.main);
  const handleToggle = (key: MenuItem) => {
    setView(key);
  };

  const Container = useCallback(
    () =>
      view === MenuItem.main ? (
        <>
          <Title>Upload 简介</Title>
          <Paragraph>
            此 Demo 用于展示如何使用 Nodejs 实现
            <Text strong> 大文件的切片上传、断点上传以及文件秒传 </Text>
            技术
          </Paragraph>
          <Paragraph>
            技术栈:
            <Link className="ml10">React</Link>
            <Link className="ml10">AntDesign</Link>
            <Link className="ml10">Express</Link>
          </Paragraph>
          <Title>实例</Title>
          <Text type="secondary">代码实现参见 BreakpointFileUpload 组件</Text>
          <div className="mt10">
            <BreakpointFileUpload />
          </div>
        </>
      ) : (
        <>
          <Title>上传配置</Title>
          <Settings />
        </>
      ),
    [view]
  );

  return (
    <>
      <style jsx global>{`
        .ml10 {
          margin-left: 10px;
        }
        .mt10 {
          margin-top: 10px;
        }
      `}</style>
      <style jsx>{`
        .container {
          padding: 10px;
        }
      `}</style>

      <Menu onClick={handleToggle} defaultCurrent={view} />
      <div className="container">
        <Container />
      </div>
    </>
  );
};

export default App;
