import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeviceCard } from "@/components/devices/DeviceCard";
import { Lightbulb } from "@/models/devices/Lightbulb";
import type { LightbulbDTO } from "@/types/device.types";
import React from "react";

// Mock the 3D component to avoid WebGL errors in tests
vi.mock("./models", () => ({
  DeviceModel3D: () => <div data-testid="mock-3d-model" />,
}));

describe("DeviceCard", () => {
  const mockDeviceDTO: LightbulbDTO = {
    id: "device-123",
    device_name: "Smart Lamp",
    device_pos: { x: 0, y: 0, z: 0 },
    room: "Living Room",
    tag: "LAMP-01",
    type: "Lightbulb",
    is_on: true,
    brightness: 80,
    colour: "#ffffff",
  };

  const mockDevice = new Lightbulb(mockDeviceDTO);

  it("renders device name and display label", () => {
    render(<DeviceCard device={mockDevice} />);
    
    expect(screen.getByText("Smart Lamp")).toBeInTheDocument();
    expect(screen.getByText("Smart Bulb")).toBeInTheDocument();
    expect(screen.getByText("Living Room")).toBeInTheDocument();
  });

  it("renders status badge correctly when On", () => {
    render(<DeviceCard device={mockDevice} />);
    const statusBadge = screen.getByText("On");
    expect(statusBadge).toBeInTheDocument();
    expect(statusBadge).toHaveClass("text-green-500");
  });

  it("renders status badge correctly when Off", () => {
    const offDevice = new Lightbulb({ ...mockDeviceDTO, is_on: false });
    render(<DeviceCard device={offDevice} />);
    const statusBadge = screen.getByText("Off");
    expect(statusBadge).toBeInTheDocument();
    expect(statusBadge).toHaveClass("text-slate-500");
  });

  it("renders property badges for brightness", () => {
    render(<DeviceCard device={mockDevice} />);
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("calls onControl when clicked", () => {
    const onControl = vi.fn();
    render(<DeviceCard device={mockDevice} onControl={onControl} />);
    
    const card = screen.getByText("Smart Lamp").closest("div");
    fireEvent.click(card!);
    
    expect(onControl).toHaveBeenCalledTimes(1);
  });

  it("renders and handles rename/delete buttons", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    
    render(
      <DeviceCard 
        device={mockDevice} 
        onRename={onRename} 
        onDelete={onDelete} 
      />
    );

    const renameButton = screen.getByTitle("Rename");
    const deleteButton = screen.getByTitle("Delete");

    expect(renameButton).toBeInTheDocument();
    expect(deleteButton).toBeInTheDocument();

    fireEvent.click(renameButton);
    expect(onRename).toHaveBeenCalledWith("Smart Lamp");

    fireEvent.click(deleteButton);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("does not render action buttons if callbacks are not provided", () => {
    render(<DeviceCard device={mockDevice} />);
    
    expect(screen.queryByTitle("Rename")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete")).not.toBeInTheDocument();
  });
});
