import React, { useState } from 'react';
import { Menu as M } from 'antd';
import { SettingOutlined, UploadOutlined } from '@ant-design/icons';

export enum MenuItem {
  main = 'main',
  setting = 'setting',
}

interface MenuProps {
  onClick?: (key: MenuItem) => void;
  defaultCurrent?: MenuItem;
}

export default function Menu({ onClick, defaultCurrent }: MenuProps) {
  const [current, setCurrent] = useState(defaultCurrent || MenuItem.main);

  const handleClick = ({ key }) => {
    if (key === current) return;
    setCurrent(key);
    onClick && onClick(key);
  };

  return (
    <M onClick={handleClick} selectedKeys={[current]} mode="horizontal">
      <M.Item key={MenuItem.main} icon={<UploadOutlined />}>
        Upload主视图
      </M.Item>
      <M.Item key={MenuItem.setting} icon={<SettingOutlined />}>
        上传配置
      </M.Item>
    </M>
  );
}
